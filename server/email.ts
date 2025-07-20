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
    url: `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/login`,
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
        <p>안녕하세요! 스토어 부스터에 가입해 주셔서 감사합니다.</p>
        <p>아래 버튼을 클릭하여 이메일 인증을 완료해주세요:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${link}" style="background-color: #4169E1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">이메일 인증하기</a>
        </div>
        <p>스토어 부스터 회원가입을 하지 않으셨다면, 해당 메일을 무시해주세요.</p>
        <p style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">© 스토어 부스터 팀</p>
      </div>
    `,
  };

  // 메일 전송
  await transporter.sendMail(mailOptions);
} 