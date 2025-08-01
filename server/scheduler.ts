import cron from 'node-cron';
import admin from 'firebase-admin';

// Firestore 초기화 확인
if (!admin.apps.length) {
  admin.initializeApp();
}

interface BillingKeyData {
  billingKey: string;
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
}

export class AutoPaymentScheduler {
  private isRunning = false;

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

    // 매일 오전 9시에 실행 (테스트용: 매분 실행)
    cron.schedule('* * * * *', async () => {
      console.log('=== 자동 결제 스케줄러 실행 시작 ===');
      console.log('실행 시간:', new Date().toISOString());
      
      try {
        await this.processAutoPayments();
      } catch (error) {
        console.error('자동 결제 처리 중 오류:', error);
      }
      
      console.log('=== 자동 결제 스케줄러 실행 완료 ===');
    });

    // 실제 운영용: 매일 오전 9시 실행
    // cron.schedule('0 9 * * *', async () => {
    //   console.log('=== 자동 결제 스케줄러 실행 시작 ===');
    //   console.log('실행 시간:', new Date().toISOString());
    //   
    //   try {
    //     await this.processAutoPayments();
    //   } catch (error) {
    //     console.error('자동 결제 처리 중 오류:', error);
    //   }
    //   
    //   console.log('=== 자동 결제 스케줄러 실행 완료 ===');
    // });
  }

  // 스케줄러 중지
  stop() {
    this.isRunning = false;
    console.log('자동 결제 스케줄러 중지됨');
  }

  // 자동 결제 처리
  private async processAutoPayments() {
    const db = admin.firestore();
    
    try {
      // 만료된 구독 찾기
      const now = new Date();
      const subscriptionsQuery = await db.collection('subscriptions')
        .where('status', '==', 'ACTIVE')
        .where('endDate', '<=', now)
        .get();

      console.log(`만료된 구독 수: ${subscriptionsQuery.size}`);

      for (const doc of subscriptionsQuery.docs) {
        const subscription = doc.data() as SubscriptionData;
        console.log(`구독 처리 중: ${subscription.uid}`);

        try {
          await this.processSubscriptionPayment(subscription.uid);
        } catch (error) {
          console.error(`구독 ${subscription.uid} 처리 실패:`, error);
        }
      }
    } catch (error) {
      console.error('구독 조회 중 오류:', error);
    }
  }

  // 개별 구독 결제 처리
  private async processSubscriptionPayment(uid: string) {
    const db = admin.firestore();
    
    try {
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
      const orderId = `AUTO_${Date.now()}_${uid}`;
      
      const paymentData = {
        clientId: clientId,
        method: "BILL",
        orderId: orderId,
        amount: 14900,
        goodsName: "스토어부스터 부스터 플랜 (자동결제)",
        billingKey: billingKeyData.billingKey,
        returnUrl: `${process.env.BASE_URL || 'https://port-0-sellermate-staging-md04rxx4d82849cd.sel5.cloudtype.app'}/api/nicepay/payment/callback`
      };

      console.log(`자동 결제 요청: ${orderId}`);

      // 나이스페이 결제 API 호출
      const response = await fetch('https://api.nicepay.co.kr/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authHeader}`
        },
        body: JSON.stringify(paymentData)
      });

      const result = await response.json();
      console.log(`나이스페이 API 응답: ${response.status}`, result);

      if (response.ok && result.resultCode === '0000') {
        // 결제 성공
        console.log(`자동 결제 성공: ${orderId}`);
        
        // 결제 정보 저장
        await db.collection('payments').doc(orderId).set({
          uid: uid,
          orderId: orderId,
          amount: 14900,
          goodsName: "스토어부스터 부스터 플랜 (자동결제)",
          status: "SUCCESS",
          billingKey: billingKeyData.billingKey,
          tid: result.tid,
          isAutoPayment: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 구독 정보 업데이트
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + 30); // 30일 연장

        await db.collection('subscriptions').doc(uid).update({
          status: "ACTIVE",
          lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
          endDate: newEndDate,
          paymentHistory: admin.firestore.FieldValue.arrayUnion({
            orderId: orderId,
            amount: 14900,
            date: admin.firestore.FieldValue.serverTimestamp(),
            status: "SUCCESS"
          })
        });

        console.log(`구독 연장 완료: ${uid}, 새로운 만료일: ${newEndDate}`);
      } else {
        // 결제 실패
        console.error(`자동 결제 실패: ${orderId}`, result);
        
        await db.collection('payments').doc(orderId).set({
          uid: uid,
          orderId: orderId,
          amount: 14900,
          goodsName: "스토어부스터 부스터 플랜 (자동결제)",
          status: "FAILED",
          billingKey: billingKeyData.billingKey,
          errorMessage: result.resultMsg,
          isAutoPayment: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 구독 상태를 만료로 변경
        await db.collection('subscriptions').doc(uid).update({
          status: "EXPIRED",
          lastPaymentAttempt: admin.firestore.FieldValue.serverTimestamp(),
          paymentFailureReason: result.resultMsg
        });
      }

    } catch (error) {
      console.error(`자동 결제 처리 중 오류 (${uid}):`, error);
      
      // 오류 정보 저장
      const orderId = `AUTO_ERROR_${Date.now()}_${uid}`;
      await db.collection('payments').doc(orderId).set({
        uid: uid,
        orderId: orderId,
        amount: 14900,
        goodsName: "스토어부스터 부스터 플랜 (자동결제)",
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        isAutoPayment: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        failedAt: admin.firestore.FieldValue.serverTimestamp()
      });
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