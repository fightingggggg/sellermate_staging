import cron from 'node-cron';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { 
  sendPaymentSuccessEmail, 
  sendPaymentFailureEmail, 
  sendSubscriptionExpiredEmail 
} from './email';

// Firestore 초기화 확인
if (!admin.apps.length) {
  admin.initializeApp();
}

interface BillingKeyData {
  billingKey?: string;
  authToken?: string;
  cardName?: string;
  cardNo?: string;
  expiry?: string;
  status: string;
}

interface SubscriptionData {
  uid: string;
  status: string;
  endDate: any;
  plan: string;
  createdAt?: any;
  lastPaymentDate?: any;
  lastPaymentAmount?: number;
  lastPaymentOrderId?: string;
  paymentHistory?: any[];
}

interface PaymentResult {
  success: boolean;
  orderId: string;
  tid?: string;
  errorMessage?: string;
}

export class AutoPaymentScheduler {
  private isRunning = false;
  private processingQueue = new Set<string>(); // 중복 처리 방지
  private retryCount = new Map<string, number>(); // 재시도 횟수 관리
  private readonly MAX_RETRIES = 2;
  private readonly BATCH_SIZE = 100; // 배치 처리 크기 증가 (더 효율적)
  private readonly PAYMENT_TIMEOUT = 30000; // 30초 타임아웃
  private readonly CONCURRENT_LIMIT = 10; // 동시 처리 제한 (API 호출 제한 고려)
  private readonly MAX_PROCESSING_TIME = 300000; // 5분 최대 처리 시간

  // KST(UTC+9) 고정 오프셋
  private static readonly KST_OFFSET_MS = 9 * 60 * 60 * 1000;

  // KST 기준 오늘 자정(00:00 KST)을 UTC 시간으로 반환
  private getKstStartOfTodayUtc(): Date {
    const nowUtcMs = Date.now();
    const kstNow = new Date(nowUtcMs + AutoPaymentScheduler.KST_OFFSET_MS);
    const y = kstNow.getUTCFullYear();
    const m = kstNow.getUTCMonth();
    const d = kstNow.getUTCDate();
    const kstMidnightUtcMs = Date.UTC(y, m, d) - AutoPaymentScheduler.KST_OFFSET_MS;
    return new Date(kstMidnightUtcMs);
  }

  // 전달된 시점이 속한 KST 날짜의 자정(00:00 KST)을 UTC 시간으로 반환
  private getKstStartOfDayUtc(dateUtc: Date): Date {
    const kstDate = new Date(dateUtc.getTime() + AutoPaymentScheduler.KST_OFFSET_MS);
    const y = kstDate.getUTCFullYear();
    const m = kstDate.getUTCMonth();
    const d = kstDate.getUTCDate();
    const kstMidnightUtcMs = Date.UTC(y, m, d) - AutoPaymentScheduler.KST_OFFSET_MS;
    return new Date(kstMidnightUtcMs);
  }

  constructor() {
    console.log('자동 결제 스케줄러 초기화 완료');
  }

  // 스케줄러 시작
  start() {
    if (this.isRunning) {
      console.log('스케줄러가 이미 실행 중입니다.');
      return;
    }

    this.isRunning = true;
    console.log('자동 결제 스케줄러 시작됨');

    // 매일 오전 6시(한국시간)에 모든 만료된 구독을 배치로 처리
    // 타임존을 Asia/Seoul로 고정해 서버 로컬 타임존과 무관하게 동일 동작
    cron.schedule('00 06 * * *', async () => {
      console.log('=== 자동 결제 스케줄러 실행 시작 ===');
      console.log('실행 시간:', new Date().toISOString());
      
      try {
        await this.processAllExpiredSubscriptions();
        await this.processCancelledSubscriptions(); // 해지된 구독 처리 추가
      } catch (error) {
        console.error('자동 결제 처리 중 오류:', error);
      }
      
      console.log('=== 자동 결제 스케줄러 실행 완료 ===');
    }, { timezone: 'Asia/Seoul' });

    // 추가 스케줄러: 13시에 재시도 (실패한 구독 처리)
    cron.schedule('00 13 * * *', async () => {
      console.log('=== 자동 결제 재시도 스케줄러 실행 시작 ===');
      console.log('실행 시간:', new Date().toISOString());
      
      try {
        await this.processRetrySubscriptions();
      } catch (error) {
        console.error('재시도 처리 중 오류:', error);
      }
      
      console.log('=== 자동 결제 재시도 스케줄러 실행 완료 ===');
    }, { timezone: 'Asia/Seoul' });
  }

  // 스케줄러 중지
  stop() {
    this.isRunning = false;
    this.processingQueue.clear();
    this.retryCount.clear();
    console.log('자동 결제 스케줄러 중지됨');
  }

  // 모든 만료된 구독을 배치로 처리
  private async processAllExpiredSubscriptions() {
    const db = admin.firestore();
    
    try {
      // 분산 락 (스케줄 전역 락) - 15분 TTL
      const lockRef = db.collection('schedulerLocks').doc('autoPaymentDaily');
      const acquired = await db.runTransaction(async (tx) => {
        const snap = await tx.get(lockRef);
        const nowTs = admin.firestore.Timestamp.now();
        const ttlThreshold = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 60 * 1000));
        if (snap.exists) {
          const createdAt = (snap.data() as any)?.createdAt as admin.firestore.Timestamp | undefined;
          if (createdAt && createdAt.toMillis() > ttlThreshold.toMillis()) {
            return false; // 다른 인스턴스가 실행 중
          }
        }
        tx.set(lockRef, { createdAt: nowTs });
        return true;
      });
      if (!acquired) {
        console.log('다른 인스턴스가 스케줄을 실행 중입니다. 이번 실행은 건너뜁니다.');
        return;
      }

      let totalProcessed = 0;
      let hasMore = true;
      
      // 모든 만료된 구독을 처리할 때까지 반복
      while (hasMore) {
        // 만료된 구독 찾기 (배치 크기 제한) - ACTIVE 상태만 처리 (CANCELLED는 제외)
        const todayKstStartUtc = this.getKstStartOfTodayUtc();
        const nextDayKstStartUtc = new Date(todayKstStartUtc.getTime() + 24 * 60 * 60 * 1000);
        const subscriptionsQuery = await db.collection('subscriptions')
          .where('status', '==', 'ACTIVE')
          .where('endDate', '<', nextDayKstStartUtc)
          .limit(this.BATCH_SIZE)
          .get();

        const expiredSubscriptions = subscriptionsQuery.docs;
        console.log(`현재 배치 만료된 구독 수: ${expiredSubscriptions.length}`);

        if (expiredSubscriptions.length === 0) {
          console.log('처리할 만료된 구독이 없습니다.');
          break;
        }

        // 동시성 제한을 적용한 병렬 처리
        const chunks = this.chunkArray(expiredSubscriptions, this.CONCURRENT_LIMIT);
        
        for (const chunk of chunks) {
          const chunkPromises = chunk.map(doc => {
            const uid = doc.id;
            
            // 이미 처리 중인 경우 스킵 (프로세스 내)
            if (this.processingQueue.has(uid)) {
              console.log(`이미 처리 중인 구독 스킵: ${uid}`);
              return Promise.resolve();
            }

            // 사용자 단위 분산 락 (5분 TTL)
            const userLockRef = db.collection('schedulerLocks').doc(`user_${uid}`);
            return db.runTransaction(async (tx) => {
              const snap = await tx.get(userLockRef);
              const nowTs = admin.firestore.Timestamp.now();
              const ttlThreshold = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 1000));
              if (snap.exists) {
                const createdAt = (snap.data() as any)?.createdAt as admin.firestore.Timestamp | undefined;
                if (createdAt && createdAt.toMillis() > ttlThreshold.toMillis()) {
                  console.log(`다른 작업이 사용자를 처리 중: ${uid}`);
                  return;
                }
              }
              tx.set(userLockRef, { createdAt: nowTs });
            }).then(() => this.processSubscriptionPaymentWithRetry(uid))
              .finally(async () => {
                try { await db.collection('schedulerLocks').doc(`user_${uid}`).delete(); } catch {}
              });
          });

          // 청크별로 처리 (동시성 제한)
          await Promise.allSettled(chunkPromises);
          
          // 청크 간 짧은 대기 (API 호출 제한 고려)
          if (chunks.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        totalProcessed += expiredSubscriptions.length;
        console.log(`배치 처리 완료: ${expiredSubscriptions.length}개 구독`);
        
        // 더 처리할 구독이 있는지 확인 (배치 크기보다 적으면 모두 처리된 것)
        hasMore = expiredSubscriptions.length === this.BATCH_SIZE;
      }

      // 전역 락 해제
      try { await db.collection('schedulerLocks').doc('autoPaymentDaily').delete(); } catch {}
      
      console.log(`총 처리 완료: ${totalProcessed}개 구독`);
    } catch (error: any) {
      console.error('만료된 구독 조회 중 오류:', error);
    }
  }

  // 해지된 구독이 만료되면 EXPIRED 상태로 변경
  private async processCancelledSubscriptions() {
    const db = admin.firestore();
    
    try {
      // 해지되었지만 아직 만료되지 않은 구독 찾기 (KST 자정 기준)
      const todayKstStartUtc = this.getKstStartOfTodayUtc();
      const cancelledSubscriptionsQuery = await db.collection('subscriptions')
        .where('status', '==', 'CANCELLED')
        .where('endDate', '<=', todayKstStartUtc)
        .limit(this.BATCH_SIZE)
        .get();

      const expiredCancelledSubscriptions = cancelledSubscriptionsQuery.docs;
      console.log(`만료된 해지 구독 수: ${expiredCancelledSubscriptions.length}`);

      if (expiredCancelledSubscriptions.length === 0) {
        console.log('처리할 만료된 해지 구독이 없습니다.');
        return;
      }

      // 해지된 구독을 EXPIRED 상태로 변경
      const batch = db.batch();
      expiredCancelledSubscriptions.forEach(doc => {
        const subscription = doc.data() as SubscriptionData;
        console.log(`해지된 구독 만료 처리: ${doc.id}, 만료일: ${subscription.endDate?.toDate?.()?.toISOString()}`);
        
        batch.update(doc.ref, {
          status: 'EXPIRED',
          plan: 'basic',
          expiredAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();
      console.log(`해지된 구독 만료 처리 완료: ${expiredCancelledSubscriptions.length}개 구독`);
      
    } catch (error: any) {
      console.error('해지된 구독 처리 중 오류:', error);
      if (error.code === 9) {
        console.log('Firestore 인덱스 오류가 발생했습니다. 인덱스 생성을 기다리는 중...');
      }
    }
  }

  // 재시도 로직이 포함된 구독 결제 처리
  private async processSubscriptionPaymentWithRetry(uid: string): Promise<void> {
    const currentRetries = this.retryCount.get(uid) || 0;
    
    if (currentRetries >= this.MAX_RETRIES) {
      console.log(`최대 재시도 횟수 초과: ${uid} (${currentRetries}회)`);
      this.retryCount.delete(uid);
      return;
    }

    // 처리 중 표시
    this.processingQueue.add(uid);
    
    try {
      const result = await this.processSubscriptionPayment(uid);
      
      if (result.success) {
        // 성공 시 재시도 카운트 초기화
        this.retryCount.delete(uid);
        console.log(`결제 성공: ${uid}`);
      } else {
        // 실패 시 재시도 카운트 증가
        this.retryCount.set(uid, currentRetries + 1);
        console.log(`결제 실패 (${currentRetries + 1}/${this.MAX_RETRIES}): ${uid}`);

        // 재시도 한도에 도달하면 만료 처리
        if (currentRetries + 1 >= this.MAX_RETRIES) {
          try {
            const db = admin.firestore();
            await this.expireSubscription(db, uid, result.errorMessage || 'Payment failed', { skipPaymentLog: true });
            // 만료되었으므로 재시도 큐에서 제거
            this.retryCount.delete(uid);
          } catch (expireErr) {
            console.error(`만료 처리 실패: ${uid}`, expireErr);
          }
        }
      }
    } catch (error) {
      // 오류 시 재시도 카운트 증가
      this.retryCount.set(uid, currentRetries + 1);
      console.error(`결제 처리 오류 (${currentRetries + 1}/${this.MAX_RETRIES}): ${uid}`, error);

      // 재시도 한도에 도달하면 만료 처리
      if (currentRetries + 1 >= this.MAX_RETRIES) {
        try {
          const db = admin.firestore();
          await this.expireSubscription(db, uid, (error as any)?.message || 'Unknown error', { skipPaymentLog: true });
          this.retryCount.delete(uid);
        } catch (expireErr) {
          console.error(`만료 처리 실패: ${uid}`, expireErr);
        }
      }
    } finally {
      // 처리 완료 표시 제거
      this.processingQueue.delete(uid);
    }
  }

  // 구독 생성 및 자동결제 스케줄 시작
  async createSubscriptionAndStartSchedule(uid: string, orderId: string, amount: number) {
    const db = admin.firestore();
    
    try {
      console.log(`=== 구독 생성: ${uid} ===`);
      
      // 구독 시작 시간 (현재 시간)
      const startDate = new Date();
      // 구독 종료 시간 (30일 후)
      const endDate = new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000));
      
      // 구독 정보 생성
      const subscriptionData = {
        uid: uid,
        status: 'ACTIVE',
        plan: 'BOOSTER',
        startDate: admin.firestore.Timestamp.fromDate(startDate),
        endDate: admin.firestore.Timestamp.fromDate(endDate),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentOrderId: orderId,
        lastPaymentAmount: amount,
        paymentHistory: [{
          orderId: orderId,
          amount: amount,
          date: admin.firestore.Timestamp.fromDate(new Date()),
          status: "SUCCESS"
        }]
      };

      // Firestore에 구독 저장
      await db.collection('subscriptions').doc(uid).set(subscriptionData);
      
      // 구독 생성 시 결제 성공 이메일 알림 전송
      try {
        const userEmail = await this.getUserEmail(uid);
        if (userEmail) {
          await sendPaymentSuccessEmail(userEmail, {
            orderId: orderId,
            amount: amount,
            goodsName: "부스터 플랜 (자동결제)",
            paymentDate: new Date(),
            nextBillingDate: endDate
          });
          console.log(`구독 생성 결제 성공 이메일 전송 완료: ${userEmail}`);
        }
      } catch (emailError) {
        console.error(`구독 생성 결제 성공 이메일 전송 실패: ${uid}`, emailError);
      }
      
      console.log(`구독 생성 완료: ${uid}, 종료일: ${endDate.toISOString()}`);
      
      return { success: true, subscription: subscriptionData };
    } catch (error) {
      console.error(`구독 생성 중 오류: ${uid}`, error);
      throw error;
    }
  }

  // 개별 구독 결제 처리 (최적화된 버전)
  private async processSubscriptionPayment(uid: string): Promise<PaymentResult> {
    const db = admin.firestore();
    
    try {
      // 구독 정보 조회 (캐시 활용)
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (!subscriptionDoc.exists) {
        console.log(`구독이 없음: ${uid}`);
        return { success: false, orderId: '', errorMessage: 'Subscription not found' };
      }

      const subscription = subscriptionDoc.data() as SubscriptionData;
      if (subscription.status !== 'ACTIVE') {
        console.log(`구독이 비활성 상태: ${uid}`);
        return { success: false, orderId: '', errorMessage: 'Subscription not active' };
      }

      // 만료 여부 확인 (KST 날짜 기준 비교)
      const todayKstStartUtc = this.getKstStartOfTodayUtc();
      const endDateRaw: Date = subscription.endDate?.toDate?.() || new Date();
      const endDateKstStartUtc = this.getKstStartOfDayUtc(endDateRaw);
      
      if (endDateKstStartUtc > todayKstStartUtc) {
        console.log(`구독이 아직 만료되지 않음: ${uid}, 만료일(KST 자정): ${endDateKstStartUtc.toISOString()}`);
        return { success: false, orderId: '', errorMessage: 'Subscription not expired' };
      }

      console.log(`만료된 구독 처리 중: ${uid}, 만료일 원시: ${endDateRaw.toISOString()}, 비교 기준(KST 자정): ${endDateKstStartUtc.toISOString()}`);

      // 빌키 정보 조회
      const billingKeyDoc = await db.collection('billingKeys').doc(uid).get();
      if (!billingKeyDoc.exists) {
        console.log(`빌키가 없음: ${uid}`);
        return { success: false, orderId: '', errorMessage: 'Billing key not found' };
      }

      const billingKeyData = billingKeyDoc.data() as BillingKeyData;
      if (billingKeyData.status !== 'ACTIVE') {
        console.log(`빌키가 비활성 상태: ${uid}`);
        return { success: false, orderId: '', errorMessage: 'Billing key not active' };
      }

      // 결제 실행
      const paymentResult = await this.executePayment(uid, billingKeyData);
      
      if (paymentResult.success) {
        // 구독 연장
        await this.extendSubscription(db, uid, paymentResult.orderId);
      } else {
        // 첫 실패 시에는 즉시 만료하지 않고, 재시도 스케줄에서 한도 초과 시 만료 처리
        await db.collection('subscriptions').doc(uid).set({
          lastPaymentAttempt: admin.firestore.FieldValue.serverTimestamp(),
          paymentFailureReason: paymentResult.errorMessage || 'Payment failed'
        }, { merge: true });
      }
       
      return paymentResult;
    } catch (error) {
      console.error('구독 결제 처리 중 오류:', error);
      return { success: false, orderId: '', errorMessage: (error as any)?.message || 'Unknown error' };
    }
  }

  // 사용자 이메일 가져오기 (Firestore usersInfo 컬렉션에서)
  private async getUserEmail(uid: string): Promise<string | null> {
    try {
      const db = admin.firestore();
      const userInfoDoc = await db.collection('usersInfo').doc(uid).get();
      
      if (userInfoDoc.exists) {
        const userData = userInfoDoc.data();
        return userData?.email || null;
      } else {
        console.log(`사용자 정보가 없음: ${uid}`);
        return null;
      }
    } catch (error) {
      console.error(`사용자 이메일 조회 실패: ${uid}`, error);
      return null;
    }
  }

  // 결제 실행 (별도 메서드로 분리)
  private async executePayment(uid: string, billingKeyData: BillingKeyData): Promise<PaymentResult> {
    const clientId = process.env.NICEPAY_CLIENT_ID;
    const secretKey = process.env.NICEPAY_SECRET_KEY;
    
    if (!clientId || !secretKey) {
      throw new Error('NicePay 인증 정보가 설정되지 않음');
    }

    const actualBillingKey = billingKeyData.billingKey || billingKeyData.authToken;
    if (!actualBillingKey) {
      throw new Error('Billing key not available');
    }

    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0'); // 6자리 랜덤 숫자
    const orderId = `AUTO_${randomNum}_${uid}`;
    const ediDate = new Date().toISOString();
    const signData = crypto.createHash('sha256')
      .update(orderId + actualBillingKey + ediDate + secretKey)
      .digest('hex');
    
    const paymentData = {
      orderId: orderId,
      amount: 9900,
      goodsName: "부스터플랜 (자동결제)",
      cardQuota: 0,
      useShopInterest: false,
      ediDate: ediDate,
      signData: signData
    };

    const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
    
    console.log(`결제 API 호출: ${orderId}`);

    // 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.PAYMENT_TIMEOUT);

    try {
      const response = await fetch(`https://api.nicepay.co.kr/v1/subscribe/${actualBillingKey}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(paymentData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const result = await response.json();
      
      if (response.ok && result.resultCode === '0000') {
        console.log(`결제 성공: ${orderId}`);
        
        // 결제 성공 정보를 payments 컬렉션에 저장 (자동결제)
        try {
          const db = admin.firestore();
          await db.collection('payments').doc(orderId).set({
            uid: uid,
            orderId: orderId,
            amount: 9900,
            goodsName: "부스터플랜 (자동결제)",
            status: "SUCCESS",
            tid: result.tid,
            isAutoPayment: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            completedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`결제 성공 정보 저장 완료: ${orderId}`);
        } catch (paymentSaveError) {
          console.error(`결제 성공 정보 저장 실패: ${uid}`, paymentSaveError);
        }
        
        // 결제 성공 이메일 알림 전송
        try {
          const userEmail = await this.getUserEmail(uid);
          if (userEmail) {
            const nextBillingDate = new Date();
            nextBillingDate.setDate(nextBillingDate.getDate() + 30);
            
            await sendPaymentSuccessEmail(userEmail, {
              orderId: orderId,
              amount: 9900,
              goodsName: "부스터플랜 (자동결제)",
              paymentDate: new Date(),
              nextBillingDate: nextBillingDate
            });
            console.log(`결제 성공 이메일 전송 완료: ${userEmail}`);
          }
        } catch (emailError) {
          console.error(`결제 성공 이메일 전송 실패: ${uid}`, emailError);
        }
        
        return { success: true, orderId, tid: result.tid };
      } else {
        console.error(`결제 실패: ${orderId}`, result);
        
        // 결제 실패 정보를 payments 컬렉션에 저장
        try {
          const db = admin.firestore();
          const paymentFailureData = {
            uid: uid,
            orderId: orderId,
            amount: 9900,
            goodsName: "부스터플랜 (자동결제)",
            status: "FAILED",
            errorMessage: result.resultMsg || '결제 처리 중 오류가 발생했습니다.',
            isAutoPayment: true,
            failureType: "PAYMENT_API_FAILED",
            nicepayResultCode: result.resultCode,
            nicepayResultMsg: result.resultMsg,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            failedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          await db.collection('payments').doc(orderId).set(paymentFailureData);
          console.log(`결제 실패 정보 저장 완료: ${orderId}`);
        } catch (paymentError) {
          console.error(`결제 실패 정보 저장 실패: ${uid}`, paymentError);
        }
        
        // 결제 실패 이메일 알림 전송
        try {
          const userEmail = await this.getUserEmail(uid);
          if (userEmail) {
            await sendPaymentFailureEmail(userEmail, {
              orderId: orderId,
              amount: 9900,
              goodsName: "부스터플랜 (자동결제)",
              failureDate: new Date(),
              errorMessage: result.resultMsg || '결제 처리 중 오류가 발생했습니다.'
            });
            console.log(`결제 실패 이메일 전송 완료: ${userEmail}`);
          }
        } catch (emailError) {
          console.error(`결제 실패 이메일 전송 실패: ${uid}`, emailError);
        }
        
        return { success: false, orderId, errorMessage: result.resultMsg };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // 구독 연장
  private async extendSubscription(db: admin.firestore.Firestore, uid: string, orderId: string) {
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + 30); // 30일 연장 (참고용, 아래에서 KST 기준으로 재계산)

    // 트랜잭션으로 중복 업데이트 방지
    await db.runTransaction(async (tx) => {
      const subRef = db.collection('subscriptions').doc(uid);
      const subSnap = await tx.get(subRef);
      const todayKstStartUtc = this.getKstStartOfTodayUtc();
      if (subSnap.exists) {
        const sub = subSnap.data() as any;
        const lastOrderId = sub?.lastPaymentOrderId;
        if (lastOrderId === orderId) {
          // 이미 같은 주문으로 연장됨
          return;
        }
        const currentEnd: Date | null = sub?.endDate?.toDate?.() || null;
        // 이미 미래로 연장되어 있으면 누적 덮어쓰기 (KST 자정 기준)
        const baseUtc = (currentEnd && this.getKstStartOfDayUtc(currentEnd) > todayKstStartUtc)
          ? currentEnd
          : todayKstStartUtc;

        // base가 속한 KST 날짜의 자정으로 정규화 후 30일 더한 값을 KST 자정으로 계산
        const baseKstStartUtc = this.getKstStartOfDayUtc(baseUtc);
        const computedEndUtc = new Date(baseKstStartUtc.getTime() + 30 * 24 * 60 * 60 * 1000);

        tx.set(subRef, {
          status: "ACTIVE",
          plan: "BOOSTER",
          lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
          lastPaymentAmount: 9900,
          lastPaymentOrderId: orderId,
          endDate: admin.firestore.Timestamp.fromDate(computedEndUtc),
          paymentHistory: admin.firestore.FieldValue.arrayUnion({
            orderId: orderId,
            amount: 9900,
            date: admin.firestore.Timestamp.fromDate(new Date()),
            status: "SUCCESS"
          })
        }, { merge: true });
      } else {
        tx.set(subRef, {
          status: "ACTIVE",
          plan: "BOOSTER"
        }, { merge: true });
      }
    });

    console.log(`구독 연장 완료: ${uid}`);
  }

  // 구독 만료 처리
  private async expireSubscription(
    db: admin.firestore.Firestore,
    uid: string,
    errorMessage: string,
    options?: { skipPaymentLog?: boolean }
  ) {
    await db.collection('subscriptions').doc(uid).set({
      status: "EXPIRED",
      plan: 'basic',
      lastPaymentAttempt: admin.firestore.FieldValue.serverTimestamp(),
      paymentFailureReason: errorMessage
    }, { merge: true });

    console.log(`구독 만료 처리: ${uid}, 사유: ${errorMessage}`);
    
    // 결제 실패 정보를 payments 컬렉션에 저장 (옵션에 따라 생략 가능)
    if (!options?.skipPaymentLog) {
      try {
        const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0'); // 6자리 랜덤 숫자
        const orderId = `AUTO_${randomNum}_${uid}`;
        const paymentFailureData = {
          uid: uid,
          orderId: orderId,
          amount: 9900,
          goodsName: "부스터플랜 (자동결제)",
          status: "FAILED",
          errorMessage: errorMessage,
          isAutoPayment: true,
          failureType: "SUBSCRIPTION_EXPIRED",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('payments').doc(orderId).set(paymentFailureData);
        console.log(`결제 실패 정보 저장 완료: ${orderId}`);
      } catch (paymentError) {
        console.error(`결제 실패 정보 저장 실패: ${uid}`, paymentError);
      }
    }
    
    // 구독 만료 이메일 알림 전송
    try {
      const userEmail = await this.getUserEmail(uid);
      if (userEmail) {
        const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
        const subscription = subscriptionDoc.data() as SubscriptionData;
        
        await sendSubscriptionExpiredEmail(userEmail, {
          plan: subscription.plan || 'BOOSTER',
          expiredDate: new Date(),
          renewalUrl: `${process.env.CLIENT_ORIGIN || 'https://storebooster.ai.kr'}/subscription`
        });
        console.log(`구독 만료 이메일 전송 완료: ${userEmail}`);
      }
    } catch (emailError) {
      console.error(`구독 만료 이메일 전송 실패: ${uid}`, emailError);
    }
  }

  // 결제 오류 처리
  private async handlePaymentError(db: admin.firestore.Firestore, uid: string, error: any) {
    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0'); // 6자리 랜덤 숫자
    const orderId = `AUTO_${randomNum}_${uid}`;
    const errorData = {
      uid: uid,
      orderId: orderId,
      amount: 9900,
      goodsName: "부스터플랜 (자동결제)",
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      isAutoPayment: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      failedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('payments').doc(orderId).set(errorData);
  }

  // 수동으로 특정 사용자의 자동 결제 실행 (테스트용)
  async runManualPayment(uid: string) {
    console.log(`수동 자동 결제 실행: ${uid}`);
    const result = await this.processSubscriptionPayment(uid);
    console.log(`수동 결제 결과: ${result.success ? '성공' : '실패'}`);
    return result;
  }

  // 배열을 청크로 나누는 유틸리티 메서드
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // 재시도가 필요한 구독 처리
  private async processRetrySubscriptions() {
    const db = admin.firestore();
    
    try {
      // 재시도 횟수가 있는 구독들만 처리
      const retryUids = Array.from(this.retryCount.keys());
      console.log(`재시도 대상 구독 수: ${retryUids.length}`);

      if (retryUids.length === 0) {
        console.log('재시도할 구독이 없습니다.');
        return;
      }

      // 재시도 대상들을 청크로 나누어 처리
      const chunks = this.chunkArray(retryUids, this.CONCURRENT_LIMIT);
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(uid => 
          this.processSubscriptionPaymentWithRetry(uid)
        );

        await Promise.allSettled(chunkPromises);
        
        // 청크 간 대기
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`재시도 처리 완료: ${retryUids.length}개 구독`);
    } catch (error: any) {
      console.error('재시도 처리 중 오류:', error);
    }
  }

  // 스케줄러 상태 확인
  getStatus() {
    return {
      isRunning: this.isRunning,
      processingCount: this.processingQueue.size,
      retryCount: this.retryCount.size,
      maxRetries: this.MAX_RETRIES,
      batchSize: this.BATCH_SIZE,
      concurrentLimit: this.CONCURRENT_LIMIT
    };
  }
}

// 싱글톤 인스턴스
export const autoPaymentScheduler = new AutoPaymentScheduler(); 