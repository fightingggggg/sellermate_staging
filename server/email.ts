import admin from "firebase-admin";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

// 환경변수 로드 (.env 파일)
dotenv.config();

// -------------------------------
// Firebase Admin 초기화
// -------------------------------

if (!admin.apps.length) {
  const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    universe_domain: 'googleapis.com'
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}


// -------------------------------
// Nodemailer 트랜스포터 설정
// -------------------------------
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

if (!emailUser || !emailPass) {
  throw new Error("EMAIL_USER / EMAIL_PASS 환경변수를 설정해주세요.");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: emailUser,
    pass: emailPass,
  },
});

// ------------------------------------------------------------------
// 이메일 인증 링크 생성 후 커스텀 템플릿으로 메일 전송
// ------------------------------------------------------------------
export async function sendVerificationEmail(email: string): Promise<void> {
  // Firebase 이메일 인증 링크 생성
  const actionCodeSettings = {
    // 이메일 인증 후 사용자가 이동할 URL (프론트엔드 라우트)
    url: `${process.env.CLIENT_ORIGIN || "https://storebooster.ai.kr"}/login`,
    handleCodeInApp: false,
  } as admin.auth.ActionCodeSettings;

  const link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);

  // 이메일 템플릿
  const mailOptions = {
    from: emailUser,
    to: email,
    subject: "스토어 부스터 이메일 인증",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #4169E1; text-align: center;">스토어 부스터 이메일 인증</h2>
        <p style="text-align: center;">안녕하세요! 스토어 부스터에 가입해 주셔서 감사합니다.</p>
        <p style="text-align: center;">아래 버튼을 클릭하여 이메일 인증을 완료해주세요:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${link}" style="background-color: #4169E1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">이메일 인증하기</a>
        </div>
        <p style="text-align: center;">스토어 부스터 회원가입을 하지 않으셨다면, 해당 메일을 무시해주세요.</p>
        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  // 메일 전송
  await transporter.sendMail(mailOptions);
}

function escapeHtml(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '';
  const s = String(input);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------------
// 결제 성공 알림 이메일 전송
// ------------------------------------------------------------------
export async function sendPaymentSuccessEmail(email: string, paymentData: {
  orderId: string;
  amount: number;
  goodsName: string;
  paymentDate: Date;
  nextBillingDate?: Date;
}): Promise<void> {
  const mailOptions = {
    from: emailUser,
    to: email,
    subject: "스토어 부스터 결제 완료 알림",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #4169E1; text-align: center;">결제가 완료되었습니다</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #4169E1; margin-top: 0;">결제 정보</h3>
          <p><strong>주문번호:</strong> ${escapeHtml(paymentData.orderId)}</p>
          <p><strong>상품명:</strong> ${escapeHtml(paymentData.goodsName)}</p>
          <p><strong>결제금액:</strong> ${paymentData.amount.toLocaleString()}원</p>
          <p><strong>결제일시:</strong> ${escapeHtml(paymentData.paymentDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
          ${paymentData.nextBillingDate ? `<p><strong>다음 결제일:</strong> ${escapeHtml(paymentData.nextBillingDate.toLocaleDateString('ko-KR'))}</p>` : ''}
        </div>
        <p style="text-align: center;">스토어 부스터 서비스를 이용해 주셔서 감사합니다.</p>
        <p style="text-align: center;">문의사항이 있으시면 언제든지 연락주세요.</p>
        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// ------------------------------------------------------------------
// 결제 실패 알림 이메일 전송
// ------------------------------------------------------------------
export async function sendPaymentFailureEmail(email: string, paymentData: {
  orderId: string;
  amount: number;
  goodsName: string;
  failureDate: Date;
  errorMessage: string;
}): Promise<void> {
  const mailOptions = {
    from: emailUser,
    to: email,
    subject: "스토어 부스터 결제 실패 알림",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #dc3545; text-align: center;">결제가 실패했습니다</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #dc3545; margin-top: 0;">결제 정보</h3>
          <p><strong>주문번호:</strong> ${escapeHtml(paymentData.orderId)}</p>
          <p><strong>상품명:</strong> ${escapeHtml(paymentData.goodsName)}</p>
          <p><strong>결제금액:</strong> ${paymentData.amount.toLocaleString()}원</p>
          <p><strong>실패일시:</strong> ${escapeHtml(paymentData.failureDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
          <p><strong>실패사유:</strong> ${escapeHtml(paymentData.errorMessage)}</p>
        </div>
        <p style="text-align: center;">결제 정보를 확인하고 다시 시도해 주세요.</p>
        <p style="text-align: center;">문제가 지속되면 고객센터로 문의해 주세요.</p>
        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// ------------------------------------------------------------------
// 환불 완료 알림 이메일 전송
// ------------------------------------------------------------------
export async function sendRefundSuccessEmail(email: string, refundData: {
  orderId: string;
  refundOrderId: string;
  amount: number;
  goodsName: string;
  refundDate: Date;
  refundReason?: string;
}): Promise<void> {
  const mailOptions = {
    from: emailUser,
    to: email,
    subject: "스토어 부스터 환불 완료 알림",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #4169E1; text-align: center;">환불이 완료되었습니다</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #4169E1; margin-top: 0;">환불 정보</h3>
          <p><strong>원주문번호:</strong> ${escapeHtml(refundData.orderId)}</p>
          <p><strong>환불주문번호:</strong> ${escapeHtml(refundData.refundOrderId)}</p>
          <p><strong>상품명:</strong> ${escapeHtml(refundData.goodsName)}</p>
          <p><strong>환불금액:</strong> ${refundData.amount.toLocaleString()}원</p>
          <p><strong>환불일시:</strong> ${escapeHtml(refundData.refundDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
          ${refundData.refundReason ? `<p><strong>환불사유:</strong> ${escapeHtml(refundData.refundReason)}</p>` : ''}
        </div>
        <p style="text-align: center;">환불 금액은 3-7일 내에 결제 수단으로 환급됩니다.</p>
        <p style="text-align: center;">문의사항이 있으시면 언제든지 연락주세요.</p>
        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// ------------------------------------------------------------------
// 구독 만료 알림 이메일 전송
// ------------------------------------------------------------------
export async function sendSubscriptionExpiredEmail(email: string, subscriptionData: {
  plan: string;
  expiredDate: Date;
  renewalUrl?: string;
}): Promise<void> {
  const mailOptions = {
    from: emailUser,
    to: email,
    subject: "스토어 부스터 구독 만료 알림",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #4169E1; text-align: center;">구독이 만료되었습니다</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #4169E1; margin-top: 0;">구독 정보</h3>
          <p><strong>구독 플랜:</strong> ${escapeHtml(subscriptionData.plan)}</p>
          <p><strong>만료일시:</strong> ${escapeHtml(subscriptionData.expiredDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
        </div>
        <p style="text-align: center;">서비스 이용을 계속하시려면 구독을 갱신해 주세요.</p>
        ${subscriptionData.renewalUrl ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${escapeHtml(subscriptionData.renewalUrl)}" style="background-color: #4169E1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">구독 갱신하기</a>
        </div>
        ` : ''}
        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// ------------------------------------------------------------------
// 멤버십 해지 알림 이메일 전송
// ------------------------------------------------------------------
export async function sendMembershipCancellationEmail(email: string, cancellationData: {
  plan: string;
  cancelledDate: Date;
  endDate: Date;
  reactivationUrl?: string;
}): Promise<void> {
  const mailOptions = {
    from: emailUser,
    to: email,
    subject: "스토어 부스터 멤버십 해지 알림",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #4169E1; text-align: center;">멤버십이 해지되었습니다</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #4169E1; margin-top: 0;">해지 정보</h3>
          <p><strong>구독 플랜:</strong> ${escapeHtml(cancellationData.plan)}</p>
          <p><strong>해지일시:</strong> ${escapeHtml(cancellationData.cancelledDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
          <p><strong>서비스 종료일:</strong> ${escapeHtml(cancellationData.endDate.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }))}</p>
        </div>
        <p style="text-align: center;">해지 예정일까지는 부스터 멤버십의 모든 기능을 정상적으로 사용할 수 있습니다.</p>
        <p style="text-align: center;">서비스 종료 전에 멤버십을 재활성화하시면 연속으로 이용하실 수 있습니다.</p>

        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
} 