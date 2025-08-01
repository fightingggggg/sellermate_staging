import cron from 'node-cron';
import admin from 'firebase-admin';
import crypto from 'crypto';

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
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 10; // 배치 처리 크기
  private readonly PAYMENT_TIMEOUT = 30000; // 30초 타임아웃

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

    // 매일 오전 9시에 모든 만료된 구독을 배치로 처리
    cron.schedule('0 9 * * *', async () => {
      console.log('=== 자동 결제 스케줄러 실행 시작 ===');
      console.log('실행 시간:', new Date().toISOString());
      
      try {
        await this.processAllExpiredSubscriptions();
      } catch (error) {
        console.error('자동 결제 처리 중 오류:', error);
      }
      
      console.log('=== 자동 결제 스케줄러 실행 완료 ===');
    });
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
      // 만료된 구독 찾기 (배치 크기 제한)
      const now = new Date();
      const subscriptionsQuery = await db.collection('subscriptions')
        .where('status', '==', 'ACTIVE')
        .where('endDate', '<=', now)
        .limit(this.BATCH_SIZE)
        .get();

      const expiredSubscriptions = subscriptionsQuery.docs;
      console.log(`만료된 구독 수: ${expiredSubscriptions.length}`);

      if (expiredSubscriptions.length === 0) {
        console.log('처리할 만료된 구독이 없습니다.');
        return;
      }

      // 병렬 처리로 성능 향상 (동시 처리 제한)
      const batchPromises = expiredSubscriptions.map(doc => {
        const subscription = doc.data() as SubscriptionData;
        const uid = doc.id;
        
        // 이미 처리 중인 경우 스킵
        if (this.processingQueue.has(uid)) {
          console.log(`이미 처리 중인 구독 스킵: ${uid}`);
          return Promise.resolve();
        }

        return this.processSubscriptionPaymentWithRetry(uid);
      });

      // 모든 처리가 완료될 때까지 대기
      await Promise.allSettled(batchPromises);
      
      console.log(`배치 처리 완료: ${expiredSubscriptions.length}개 구독`);
    } catch (error: any) {
      console.error('만료된 구독 조회 중 오류:', error);
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
      }
    } catch (error) {
      // 오류 시 재시도 카운트 증가
      this.retryCount.set(uid, currentRetries + 1);
      console.error(`결제 처리 오류 (${currentRetries + 1}/${this.MAX_RETRIES}): ${uid}`, error);
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
      // 구독 종료 시간 (24시간 후)
      const endDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
      
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

      // 만료 여부 확인
      const now = new Date();
      const endDate = subscription.endDate?.toDate() || new Date();
      if (endDate > now) {
        console.log(`구독이 아직 만료되지 않음: ${uid}, 만료일: ${endDate.toISOString()}`);
        return { success: false, orderId: '', errorMessage: 'Subscription not expired' };
      }

      console.log(`만료된 구독 처리 중: ${uid}, 만료일: ${endDate.toISOString()}`);

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
        // 구독 만료 처리
        await this.expireSubscription(db, uid, paymentResult.errorMessage || 'Payment failed');
      }

      return paymentResult;
    } catch (error) {
      console.error(`자동 결제 처리 중 오류 (${uid}):`, error);
      await this.handlePaymentError(db, uid, error);
      return { 
        success: false, 
        orderId: `AUTO_ERROR_${Date.now()}_${uid}`, 
        errorMessage: error instanceof Error ? error.message : 'Unknown error' 
      };
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

    const orderId = `AUTO_${Date.now()}_${uid}`;
    const ediDate = new Date().toISOString();
    const signData = crypto.createHash('sha256')
      .update(orderId + actualBillingKey + ediDate + secretKey)
      .digest('hex');
    
    const paymentData = {
      orderId: orderId,
      amount: 500,
      goodsName: "스토어부스터 부스터 플랜 (자동결제)",
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
        return { success: true, orderId, tid: result.tid };
      } else {
        console.error(`결제 실패: ${orderId}`, result);
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
    newEndDate.setDate(newEndDate.getDate() + 1); // 24시간 연장

    await db.collection('subscriptions').doc(uid).set({
      status: "ACTIVE",
      lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
      endDate: admin.firestore.Timestamp.fromDate(newEndDate),
      paymentHistory: admin.firestore.FieldValue.arrayUnion({
        orderId: orderId,
        amount: 500,
        date: admin.firestore.Timestamp.fromDate(new Date()),
        status: "SUCCESS"
      })
    }, { merge: true });

    console.log(`구독 연장 완료: ${uid}, 새로운 만료일: ${newEndDate.toISOString()}`);
  }

  // 구독 만료 처리
  private async expireSubscription(db: admin.firestore.Firestore, uid: string, errorMessage: string) {
    await db.collection('subscriptions').doc(uid).set({
      status: "EXPIRED",
      lastPaymentAttempt: admin.firestore.FieldValue.serverTimestamp(),
      paymentFailureReason: errorMessage
    }, { merge: true });

    console.log(`구독 만료 처리: ${uid}, 사유: ${errorMessage}`);
  }

  // 결제 오류 처리
  private async handlePaymentError(db: admin.firestore.Firestore, uid: string, error: any) {
    const orderId = `AUTO_ERROR_${Date.now()}_${uid}`;
    const errorData = {
      uid: uid,
      orderId: orderId,
      amount: 500,
      goodsName: "스토어부스터 부스터 플랜 (자동결제)",
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

  // 스케줄러 상태 확인
  getStatus() {
    return {
      isRunning: this.isRunning,
      processingCount: this.processingQueue.size,
      retryCount: this.retryCount.size,
      maxRetries: this.MAX_RETRIES,
      batchSize: this.BATCH_SIZE
    };
  }
}

// 싱글톤 인스턴스
export const autoPaymentScheduler = new AutoPaymentScheduler(); 