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
}

export class AutoPaymentScheduler {
  private isRunning = false;
  private userSchedules = new Map<string, any>();

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

    // 1분마다 새로운 구독을 확인하여 개별 스케줄 설정
    cron.schedule('*/1 * * * *', async () => {
      console.log('=== 구독 스케줄 확인 시작 ===');
      console.log('실행 시간:', new Date().toISOString());
      
      try {
        await this.checkAndScheduleSubscriptions();
      } catch (error) {
        console.error('구독 스케줄 확인 중 오류:', error);
      }
      
      console.log('=== 구독 스케줄 확인 완료 ===');
    });
  }

  // 스케줄러 중지
  stop() {
    this.isRunning = false;
    
    // 모든 유저 스케줄 중지
    for (const [uid, schedule] of this.userSchedules) {
      schedule.stop();
      console.log(`유저 ${uid} 스케줄 중지됨`);
    }
    this.userSchedules.clear();
    
    console.log('자동 결제 스케줄러 중지됨');
  }

  // 구독 확인 및 개별 스케줄 설정
  private async checkAndScheduleSubscriptions() {
    const db = admin.firestore();
    
    try {
      // 활성 구독 찾기
      const subscriptionsQuery = await db.collection('subscriptions')
        .where('status', '==', 'ACTIVE')
        .get();

      const activeSubscriptions = subscriptionsQuery.docs;
      console.log(`활성 구독 수: ${activeSubscriptions.length}`);

      // 현재 스케줄된 유저들 확인
      const scheduledUsers = new Set(this.userSchedules.keys());
      const activeUsers = new Set(activeSubscriptions.map(doc => doc.id));

      // 더 이상 활성화되지 않은 구독의 스케줄 제거
      for (const uid of scheduledUsers) {
        if (!activeUsers.has(uid)) {
          const schedule = this.userSchedules.get(uid);
          if (schedule) {
            schedule.stop();
            this.userSchedules.delete(uid);
            console.log(`유저 ${uid} 스케줄 제거됨`);
          }
        }
      }

      // 새로운 활성 구독에 대해 개별 스케줄 설정
      for (const doc of activeSubscriptions) {
        const subscription = doc.data() as SubscriptionData;
        const uid = doc.id;

        if (!this.userSchedules.has(uid)) {
          await this.scheduleUserPayment(uid, subscription);
        }
      }
    } catch (error) {
      console.error('구독 확인 중 오류:', error);
    }
  }

  // 개별 유저 결제 스케줄 설정
  private async scheduleUserPayment(uid: string, subscription: SubscriptionData) {
    try {
      // 구독 시작 시간 기준으로 5분마다 실행
      const startTime = subscription.createdAt?.toDate() || new Date();
      const now = new Date();
      
      // 다음 실행 시간 계산 (5분 간격)
      const timeSinceStart = now.getTime() - startTime.getTime();
      const minutesSinceStart = Math.floor(timeSinceStart / (1000 * 60));
      const nextInterval = Math.ceil(minutesSinceStart / 5) * 5;
      const nextExecutionTime = new Date(startTime.getTime() + (nextInterval * 60 * 1000));
      
      console.log(`유저 ${uid} 스케줄 설정: ${nextExecutionTime.toISOString()}`);

      // 5분마다 실행되는 스케줄 생성
      const schedule = cron.schedule('*/5 * * * *', async () => {
        console.log(`=== 유저 ${uid} 자동 결제 실행 ===`);
        console.log('실행 시간:', new Date().toISOString());
        
        try {
          await this.processSubscriptionPayment(uid);
        } catch (error) {
          console.error(`유저 ${uid} 자동 결제 처리 중 오류:`, error);
        }
      });

      // 스케줄 시작
      schedule.start();
      this.userSchedules.set(uid, schedule);
      
      console.log(`유저 ${uid} 스케줄 시작됨`);
    } catch (error) {
      console.error(`유저 ${uid} 스케줄 설정 중 오류:`, error);
    }
  }



  // 개별 구독 결제 처리
  private async processSubscriptionPayment(uid: string) {
    const db = admin.firestore();
    
    try {
      // 구독 정보 조회
      const subscriptionDoc = await db.collection('subscriptions').doc(uid).get();
      if (!subscriptionDoc.exists) {
        console.log(`구독이 없음: ${uid}`);
        return;
      }

      const subscription = subscriptionDoc.data() as SubscriptionData;
      if (subscription.status !== 'ACTIVE') {
        console.log(`구독이 비활성 상태: ${uid}`);
        return;
      }

      // 만료 여부 확인
      const now = new Date();
      const endDate = subscription.endDate?.toDate() || new Date();
      if (endDate > now) {
        console.log(`구독이 아직 만료되지 않음: ${uid}, 만료일: ${endDate.toISOString()}`);
        return;
      }

      console.log(`만료된 구독 처리 중: ${uid}, 만료일: ${endDate.toISOString()}`);

      // 빌키 정보 조회
      const billingKeyDoc = await db.collection('billingKeys').doc(uid).get();
      if (!billingKeyDoc.exists) {
        console.log(`빌키가 없음: ${uid}`);
        return;
      }

      const billingKeyData = billingKeyDoc.data() as BillingKeyData;
      if (billingKeyData.status !== 'ACTIVE') {
        console.log(`빌키가 비활성 상태: ${uid}`);
        return;
      }

      // 나이스페이 API 호출
      const clientId = process.env.NICEPAY_CLIENT_ID;
      const secretKey = process.env.NICEPAY_SECRET_KEY;
      
      if (!clientId || !secretKey) {
        console.error('NicePay 인증 정보가 설정되지 않음');
        return;
      }

      const authHeader = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
      // billingKey가 없으면 authToken을 사용
      const actualBillingKey = billingKeyData.billingKey || billingKeyData.authToken;
      
      if (!actualBillingKey) {
        console.error(`빌키가 없음: ${uid}`);
        return;
      }

      const orderId = `AUTO_${Date.now()}_${uid}`;
      
      const paymentData = {
        clientId: clientId,
        method: "BILL",
        orderId: orderId,
        amount: 500,
        goodsName: "스토어부스터 부스터 플랜 (자동결제)",
        billingKey: actualBillingKey, // authToken이 아닌 billingKey 사용
        returnUrl: `${process.env.BASE_URL || 'https://port-0-sellermate-staging-md04rxx4d82849cd.sel5.cloudtype.app'}/api/nicepay/webhook`,
        useEscrow: false,
        currency: "KRW",
        taxFreeAmount: 0,
        supplyAmount: 455,
        taxAmount: 45
      };

      console.log(`=== 자동 결제 API 호출 시작: ${orderId} ===`);
      console.log("빌키 ID:", actualBillingKey);
      console.log("API URL:", `https://api.nicepay.co.kr/v1/subscribe/${actualBillingKey}/payments`);
      console.log("요청 헤더:", {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader.substring(0, 20)}...`
      });
      
      // ediDate 생성 (ISO 8601 형식)
      const ediDate = new Date().toISOString();
      
      // signData 생성 (hex(sha256(orderId + bid + ediDate + SecretKey)))
      const signData = crypto.createHash('sha256')
        .update(orderId + actualBillingKey + ediDate + secretKey)
        .digest('hex');
      
      // 빌키 결제용 요청 데이터 (필드명 변경)
      const billingPaymentData = {
        orderId: orderId,
        amount: 500,
        goodsName: "스토어부스터 부스터 플랜 (자동결제)",
        cardQuota: 0,
        useShopInterest: false,
        ediDate: ediDate,
        signData: signData
      };
      
      console.log("요청 본문:", JSON.stringify(billingPaymentData, null, 2));

      // 나이스페이 빌키 결제 API 호출
      const response = await fetch(`https://api.nicepay.co.kr/v1/subscribe/${actualBillingKey}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(billingPaymentData)
      });

      console.log("API 응답 상태:", response.status);
      console.log("API 응답 헤더:", Object.fromEntries(response.headers.entries()));
      const result = await response.json();
      console.log("API 응답 본문:", JSON.stringify(result, null, 2));
      console.log(`=== 자동 결제 API 호출 완료: ${orderId} ===`);

      if (response.ok && result.resultCode === '0000') {
        // 결제 성공
        console.log(`자동 결제 성공: ${orderId}`);
        
        // 결제 정보 저장 (undefined 값 필터링)
        const paymentData: any = {
          uid: uid,
          orderId: orderId,
          amount: 500,
          goodsName: "스토어부스터 부스터 플랜 (자동결제)",
          status: "SUCCESS",
          isAutoPayment: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (billingKeyData.billingKey !== undefined) paymentData.billingKey = billingKeyData.billingKey;
        if (result.tid !== undefined) paymentData.tid = result.tid;

        await db.collection('payments').doc(orderId).set(paymentData);

        // 구독 정보 업데이트 (문서가 없으면 생성)
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + 30); // 30일 연장

        await db.collection('subscriptions').doc(uid).set({
          status: "ACTIVE",
          lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
          endDate: newEndDate,
          uid: uid,
          plan: "BOOSTER",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentHistory: admin.firestore.FieldValue.arrayUnion({
            orderId: orderId,
            amount: 500,
            date: admin.firestore.FieldValue.serverTimestamp(),
            status: "SUCCESS"
          })
        }, { merge: true });

        console.log(`구독 연장 완료: ${uid}, 새로운 만료일: ${newEndDate}`);
      } else {
        // 결제 실패
        console.error(`자동 결제 실패: ${orderId}`, result);
        
        // 실패 정보 저장 (undefined 값 필터링)
        const failureData: any = {
          uid: uid,
          orderId: orderId,
          amount: 500,
          goodsName: "스토어부스터 부스터 플랜 (자동결제)",
          status: "FAILED",
          errorMessage: result.resultMsg,
          isAutoPayment: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (billingKeyData.billingKey !== undefined) failureData.billingKey = billingKeyData.billingKey;

        await db.collection('payments').doc(orderId).set(failureData);

        // 구독 상태를 만료로 변경 (문서가 없으면 생성)
        await db.collection('subscriptions').doc(uid).set({
          status: "EXPIRED",
          lastPaymentAttempt: admin.firestore.FieldValue.serverTimestamp(),
          paymentFailureReason: result.resultMsg,
          uid: uid,
          plan: "BOOSTER",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

    } catch (error) {
      console.error(`자동 결제 처리 중 오류 (${uid}):`, error);
      
      // 오류 정보 저장 (undefined 값 필터링)
      const orderId = `AUTO_ERROR_${Date.now()}_${uid}`;
      const errorData: any = {
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
  }

  // 수동으로 특정 사용자의 자동 결제 실행 (테스트용)
  async runManualPayment(uid: string) {
    console.log(`수동 자동 결제 실행: ${uid}`);
    await this.processSubscriptionPayment(uid);
  }
}

// 싱글톤 인스턴스
export const autoPaymentScheduler = new AutoPaymentScheduler(); 