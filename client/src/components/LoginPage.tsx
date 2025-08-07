import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";

interface LoginPageProps {
  isModal?: boolean;
  onLoginSuccess?: () => void;
}

export default function LoginPage({
  isModal = false,
  onLoginSuccess,
}: LoginPageProps) {
  const { signIn, signUp, loading, error, currentUser, sendPasswordReset } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState(""); // 비밀번호 확인 추가
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState(""); // 생년월일 추가
  const [birthDateError, setBirthDateError] = useState(""); // 생년월일 오류 메시지
  const [number, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+82");
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "login";
  });
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [ageCheck, setAgeCheck] = useState(false);
  const [alertMessage, setAlertMessage] = useState({ message: "", type: "" }); // Alert message state
  const [showSimpleSignup, setShowSimpleSignup] = useState(false); // 간편 회원가입 폼 표시 여부
  const [, navigate] = useLocation();
  const [signUpProcessing, setSignUpProcessing] = useState(false);
  // 소셜 로그인/회원가입 로딩 상태 추가
  const [naverLoginLoading, setNaverLoginLoading] = useState(false);
  const [kakaoLoginLoading, setKakaoLoginLoading] = useState(false);
  const [naverSignupLoading, setNaverSignupLoading] = useState(false);
  const [kakaoSignupLoading, setKakaoSignupLoading] = useState(false);

  // 페이지 진입 시(마운트 시) 로딩 상태 초기화 및 에러 메시지 확인
  useEffect(() => {
    setNaverLoginLoading(false);
    setKakaoLoginLoading(false);
    setNaverSignupLoading(false);
    setKakaoSignupLoading(false);

    // URL 파라미터에서 에러 메시지 확인
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const message = params.get("message");
    
    if (error === "recent-deletion" && message) {
      toast({
        title: "재가입 제한",
        description: message,
        variant: "destructive",
      });
      // URL에서 에러 파라미터 제거
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("error");
      newUrl.searchParams.delete("message");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [toast]);

  // 기능 재활성화를 대비해 Kakao 로그인/회원가입 버튼 표시 여부를 토글합니다.
  const ENABLE_KAKAO = true;

  // RecaptchaVerifier는 SMS 코드 발송 시점에 동적으로 초기화

  useEffect(() => {
    if (currentUser && !isModal && auth.currentUser?.emailVerified) {
      navigate("/");
    }
    if (currentUser && isModal && onLoginSuccess && auth.currentUser?.emailVerified) {
      onLoginSuccess();
    }
  }, [currentUser, isModal, navigate, onLoginSuccess]);

  const handleLogin = async () => {
    if (!email || !password) return;
    const success = await signIn(email, password);
    if (success && onLoginSuccess) {
      onLoginSuccess();
    }
  };

  const isValidURL = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // 생년월일 유효성 검사 함수
  const validateBirthDate = (date: string) => {
    if (date.length !== 6) {
      return "생년월일은 6자리로 입력해주세요.";
    }
    
    const year = parseInt(date.substring(0, 2));
    const month = parseInt(date.substring(2, 4));
    const day = parseInt(date.substring(4, 6));
    
    // 현재 연도 기준으로 유효한 연도인지 확인 (1900년대 또는 2000년대)
    const currentYear = new Date().getFullYear();
    const currentYearLastTwo = currentYear % 100;
    
    let fullYear;
    if (year > currentYearLastTwo) {
      fullYear = 1900 + year;
    } else {
      fullYear = 2000 + year;
    }
    
    // 연도 범위 확인 (1900년 ~ 현재 연도)
    if (fullYear < 1900 || fullYear > currentYear) {
      return "유효하지 않은 연도입니다.";
    }
    
    // 월 범위 확인
    if (month < 1 || month > 12) {
      return "유효하지 않은 월입니다.";
    }
    
    // 일 범위 확인
    const daysInMonth = new Date(fullYear, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      return "유효하지 않은 일입니다.";
    }
    
    return "";
  };

  // 입력값을 국제전화번호(E.164) 형식으로 변환
  const buildE164Number = (code: string, raw: string) => {
    const clean = raw.replace(/[\s-]/g, "");

    // 사용자가 + 포함 입력하면 우선
    if (clean.startsWith("+")) return clean;

    // 한국(+82)은 선행 0 제거
    if (code === "+82" && clean.startsWith("0")) {
      return code + clean.slice(1);
    }

    return code + clean;
  };

  const handleSendCode = async () => {
    if (!number || sendingCode) return;
    setSendingCode(true);
    try {
      const phoneNumber = buildE164Number(countryCode, number);

      // 휴대폰 번호 중복 여부 확인
      try {
        const usersRef = collection(db, "usersInfo");
        const q = query(usersRef, where("number", "==", phoneNumber));
        const existing = await getDocs(q);
        if (!existing.empty) {
          setAlertMessage({ message: "이미 가입된 휴대폰 번호입니다.", type: "error" });
          setSendingCode(false);
          return;
        }
      } catch (err) {
        console.error("[DUP_CHECK] 휴대폰 번호 중복 확인 실패", err);
      }

      console.log("[DEBUG] 요청 전화번호(E164):", phoneNumber);

      // RecaptchaVerifier 초기화 (필요 시)
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
          // Firebase가 기본 Site Key를 자동으로 사용하도록 sitekey 지정 제거
        });
        await recaptchaRef.current.render();
      }

      // reCAPTCHA 토큰 수동 획득하여 확인 (디버그 용)
      let debugRecaptchaToken: string | undefined;
      try {
        debugRecaptchaToken = await recaptchaRef.current.verify();
        console.log("[DEBUG] reCAPTCHA 토큰:", debugRecaptchaToken?.substring(0, 20) + "...");
      } catch (e) {
        console.error("[DEBUG] reCAPTCHA verify 실패", e);
      }

      const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaRef.current!);
      setConfirmationResult(result);
      setCodeSent(true);
      setAlertMessage({ message: "인증번호가 전송되었습니다.", type: "success" });
    } catch (err: any) {
      console.error("send sms error", err?.code, err?.message, err);
      let msg: string;
      if (err?.code === "auth/too-many-requests") {
        msg = "너무 많이 시도했습니다. 잠시 후 재시도해 주세요.";
      } else if (err?.code === "auth/invalid-phone-number") {
        const detail = err?.message || "";
        if (detail.includes("Invalid format")) {
          msg = "전화번호가 아닌 것 같아요. 번호 숫자를 입력해주세요.";
        } else if (detail.includes("TOO_LONG")) {
          msg = "번호가 너무 길어요. 올바른 번호를 입력해주세요.";
        } else {
          msg = "휴대폰 번호 형식이 올바르지 않습니다.";
        }
      } else if (err?.code === "auth/invalid-app-credential") {
        msg = "인증번호 전송에 실패했어요. 잠시후 다시 시도해주세요.";
      } else {
        msg = err?.message || "SMS 발송 중 오류가 발생했습니다.";
      }
      setAlertMessage({ message: msg, type: "error" });
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || !confirmationResult || confirmingCode) return;
    setConfirmingCode(true);
    try {
      await confirmationResult.confirm(verificationCode);
      setPhoneVerified(true);
      setAlertMessage({ message: "휴대폰 인증이 완료되었습니다.", type: "success" });
      // 휴대폰 인증 후에는 현재 사용자를 유지하여 이후 이메일/비밀번호 자격 증명을 연결합니다.
    } catch (err: any) {
      console.error("verify code error", err);
      let msg: string;
      if (err?.code === "auth/invalid-verification-code") {
        msg = "인증번호가 올바르지 않아요. 다시 입력해주세요.";
      } else {
        msg = err?.message || "인증번호가 올바르지 않습니다.";
      }
      setAlertMessage({ message: msg, type: "error" });
    } finally {
      setConfirmingCode(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password || !fullName || !birthDate || !number)
      return;

    if (password !== passwordConfirm) {
      setAlertMessage({
        message: "비밀번호가 일치하지 않습니다. 다시 확인해주세요.",
        type: "error",
      });
      return;
    }

    setSignUpProcessing(true);

    try {
      await signUp(email, password, fullName, number, birthDate);
      if (!isModal) {
        navigate("/login");
      }
      setAlertMessage({
        message: "회원가입 성공! 이메일 인증을 완료해주세요.",
        type: "success"
      });
      // 폼 초기화
      setEmail("");
      setPassword("");
      setFullName("");
      setBirthDate(""); // 생년월일 초기화
      setBirthDateError(""); // 생년월일 오류 초기화
      setPhoneNumber("");
      setPasswordConfirm("");
      setTerms(false);
      setAgeCheck(false);
      // 로그인 탭으로 전환
      setTab("login");
    } catch (error: any) {
      console.error("Signup error:", error);
      if (error.code === "auth/email-already-in-use") {
        setAlertMessage({
          message:
            "이미 가입된 이메일입니다. 로그인 페이지에서 로그인을 진행하시거나 비밀번호 찾기를 이용해주세요.",
          type: "error",
        });
      } else if (error.code === "auth/invalid-email") {
        setAlertMessage({
          message: "올바른 이메일 형식이 아닙니다. 예시: your.name@example.com",
          type: "error",
        });
      } else if (
        error.code === "auth/weak-password" ||
        error.code === "auth/password-does-not-meet-requirements"
      ) {
        setAlertMessage({
          message:
            "비밀번호는 소문자, 특수문자, 숫자 포함 6자 이상이여야 합니다",
          type: "error",
        });
      } else if (error.code === "auth/network-request-failed") {
        setAlertMessage({
          message: "네트워크 연결을 확인해주세요.",
          type: "error",
        });
      } else if (error.code === "auth/too-many-requests") {
        setAlertMessage({
          message: "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.",
          type: "error",
        });
      } else if (error.code === "auth/phone-already-in-use") {
        setAlertMessage({
          message: "이미 가입된 휴대폰 번호입니다.",
          type: "error",
        });
      } else if (error.code === "auth/recent-account-deletion") {
        setAlertMessage({
          message: "최근 탈퇴한 계정은 30일 이후에 재가입할 수 있습니다.",
          type: "error",
        });
      } else {
        setAlertMessage({
          message:
            "회원가입 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
          type: "error",
        });
      }
    } finally {
      setSignUpProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (tab === "login") {
        handleLogin();
      } else {
        handleSignUp();
      }
    }
  };

  const content = (
    <Card className={`w-full max-w-md ${isModal ? "shadow-xl" : ""}`}>
      <CardHeader className="text-center">
        <CardTitle
          onClick={() => window.location.href = 'https://storebooster.ai.kr/'}
          className="cursor-pointer flex flex-col items-center"
        >
          <img src="/logo.png" alt="스토어부스터" style={{ height: '1.5em', margin: 0, display: 'inline-block', verticalAlign: 'middle' }} />
        </CardTitle>
        <CardDescription>
          스마트스토어 상위노출 최적화를 위한 완벽한 솔루션
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login">로그인</TabsTrigger>
            <TabsTrigger value="register">회원가입</TabsTrigger>
          </TabsList>

          {/* 로그인 탭 */}
          <TabsContent value="login" role="tabpanel" aria-label="로그인">
            <div className="space-y-4">
              <p className="text-sm text-center text-gray-600 mb-4">
                로그인하여 무료로 이용해보세요!
              </p>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="이메일을 입력하세요"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="transition-all duration-300 focus:ring-2 focus:ring-blue-500 data-[highlight=true]:ring-4 data-[highlight=true]:ring-blue-500 data-[highlight=true]:shadow-lg data-[highlight=true]:shadow-blue-200 data-[highlight=true]:scale-105 data-[highlight=true]:animate-[pulse_1s_ease-in-out_infinite]"
                  data-highlight="false"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>

              <Button
                onClick={handleLogin}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 mb-2"
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  "이메일로 로그인"
                )}
              </Button>
              {/* 비밀번호 재설정 링크는 소셜 버튼 아래로 이동 */}
            </div>
          </TabsContent>

          {/* 회원가입 탭 */}
          <TabsContent value="register">
            <div className="space-y-2">
              <p className="text-sm text-center text-gray-600 mb-4">
                회원가입 후 모든 기능을 무료로 이용해보세요!
              </p>

              {/* === 간편 회원가입 방식 선택 === */}
              {!showSimpleSignup && (
                <div className="grid gap-2 mb-4">
                  {/* 네이버 간편 로그인/회원가입 */}
                  <Button
                    className="w-full bg-[#03C75A] hover:bg-[#02b152] text-white"
                    onClick={() => {
                      setNaverSignupLoading(true);
                      window.location.href = "/api/auth/naver";
                    }}
                    disabled={naverSignupLoading}
                  >
                    {naverSignupLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        네이버로 간편 회원가입 중...
                      </>
                    ) : (
                      "네이버로 간편 회원가입"
                    )}
                  </Button>

                  {/* 카카오톡 간편 로그인/회원가입 (현재 비활성화) */}
                  {ENABLE_KAKAO && (
                    <Button
                      className="w-full bg-[#FEE500] hover:bg-[#ffd400] text-black"
                      onClick={async () => {
                        setKakaoSignupLoading(true);
                        try {
                          const res = await fetch("/api/auth/kakao", { method: "GET" });
                          if (!res.ok) {
                            const txt = await res.text();
                            console.error("[KAKAO-SIGNUP] 오류 응답 본문:", txt);
                          }
                        } catch (err) {
                          console.error("[KAKAO-SIGNUP] 네트워크 오류", err);
                        }
                        window.location.href = "/api/auth/kakao";
                      }}
                      disabled={kakaoSignupLoading}
                    >
                      {kakaoSignupLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          카카오톡으로 간편 회원가입 중...
                        </>
                      ) : (
                        "카카오톡으로 간편 회원가입"
                      )}
                    </Button>
                  )}
                </div>
              )}
              {showSimpleSignup && (
                <>
                  {alertMessage.message && (
                    <Alert
                      variant={
                        alertMessage.type === "success" ? "success" : "destructive"
                      }
                    >
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{alertMessage.message}</AlertDescription>
                    </Alert>
                  )}

                  {/* 이름 입력 */}
                  <div className="space-y-2">
                    <Label htmlFor="fullName">
                      이름 <span className="text-gray-400">*</span>
                    </Label>
                    <Input
                      id="fullName"
                      placeholder="이름을 입력하세요"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                  </div>

                  {/* 생년월일 입력 */}
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">
                      생년월일 <span className="text-gray-400">*</span>
                    </Label>
                    <Input
                      id="birthDate"
                      placeholder="생년월일 6자리 (예: 901231)"
                      value={birthDate}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                        setBirthDate(value);
                        // 유효성 검사
                        if (value.length === 6) {
                          const error = validateBirthDate(value);
                          setBirthDateError(error);
                        } else {
                          setBirthDateError("");
                        }
                      }}
                      onKeyPress={handleKeyPress}
                      maxLength={6}
                      className={birthDateError ? "border-red-500" : ""}
                    />
                    {birthDateError ? (
                      <p className="text-xs text-red-500">{birthDateError}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        생년월일을 6자리로 입력해주세요 (예: 901231)
                      </p>
                    )}
                  </div>

                  {/* 국가 코드 + 휴대폰 번호 */}
                  <div className="space-y-2">
                    <Label htmlFor="number">
                      휴대폰 번호 <span className="text-gray-400">*</span>
                    </Label>
                    <div className="flex space-x-2">
                      {/* 국가 코드 선택 */}
                      <div className="w-28">
                        {/* 한국(+82)만 선택 가능하도록 드롭다운을 읽기 전용으로 고정 */}
                        <select
                          value={countryCode}
                          disabled
                          className="border rounded-md text-sm h-10 px-2 bg-gray-100 cursor-not-allowed"
                        >
                          <option value="+82">🇰🇷 +82</option>
                        </select>
                      </div>

                      {/* 번호 입력 */}
                      <Input
                        id="number"
                        placeholder="번호만 입력"
                        value={number}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendCode}
                        disabled={sendingCode || !number || phoneVerified}
                      >
                        {sendingCode ? "전송중..." : phoneVerified ? "인증완료" : "인증번호 발송"}
                      </Button>
                    </div>
                  </div>

                  {codeSent && !phoneVerified && (
                    <div className="space-y-2">
                      <Label htmlFor="smscode">인증번호</Label>
                      <div className="flex space-x-2">
                        <Input
                          id="smscode"
                          placeholder="6자리 코드"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleVerifyCode}
                          disabled={confirmingCode || verificationCode.length < 4}
                        >
                          {confirmingCode ? "확인중..." : "확인"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div id="recaptcha-container" />

                  {/* 이메일 입력 */}
                  <div className="space-y-2">
                    <Label htmlFor="register-email">
                      이메일 <span className="text-gray-400">*</span>
                    </Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="이메일을 입력하세요"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">비밀번호</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="비밀번호를 입력하세요 (특수 문자 포함 6자 이상)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password-confirm">비밀번호 확인</Label>
                    <Input
                      id="register-password-confirm"
                      type="password"
                      placeholder="비밀번호를 한 번 더 입력하세요"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                  </div>

                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                      id="ageCheck"
                      checked={ageCheck}
                      onCheckedChange={(checked) => setAgeCheck(checked as boolean)}
                    />
                    <label
                      htmlFor="ageCheck"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      만 14세 이상입니다
                    </label>
                  </div>

                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                      id="terms"
                      checked={terms}
                      onCheckedChange={(checked) => setTerms(checked as boolean)}
                    />
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      <a
                        href="https://chambray-midnight-e7f.notion.site/22c78708053f80998563d392eadb9152?pvs=74"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-600 hover:text-blue-800"
                      >
                        이용약관
                      </a>
                      에 동의합니다
                    </label>
                  </div>

                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                      id="privacy"
                      checked={privacy}
                      onCheckedChange={(checked) => setPrivacy(checked as boolean)}
                    />
                    <label
                      htmlFor="privacy"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      <a
                        href="https://chambray-midnight-e7f.notion.site/18678708053f806a9955f0f5375cdbdd"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-600 hover:text-blue-800"
                      >
                        개인정보처리방침
                      </a>
                      에 동의합니다
                    </label>
                  </div>

                  <Button
                    onClick={handleSignUp}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 mt-4"
                    disabled={
                      signUpProcessing ||
                      !email ||
                      !password ||
                      !fullName ||
                      !birthDate || // 생년월일 필수
                      !!birthDateError || // 생년월일 오류가 있으면 비활성화
                      !number ||
                      !ageCheck ||
                      !terms ||
                      !privacy || !phoneVerified
                    }
                  >
                    {signUpProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        간편 회원가입 중...
                      </>
                    ) : (
                      "간편 회원가입"
                    )}
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          {/* 로그인 탭 소셜 버튼 + 비밀번호 링크 */}
          <TabsContent value="login" role="tabpanel" className="mt-2">
            <div className="grid gap-2">
              <Button
                className="w-full bg-[#03C75A] hover:bg-[#02b152] text-white"
                onClick={() => {
                  setNaverLoginLoading(true);
                  window.location.href = "/api/auth/naver";
                }}
                disabled={naverLoginLoading}
              >
                {naverLoginLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    네이버로 로그인 중...
                  </>
                ) : (
                  "네이버로 로그인"
                )}
              </Button>
              {ENABLE_KAKAO && (
                <Button
                  className="w-full bg-[#FEE500] hover:bg-[#ffd400] text-black"
                  onClick={() => {
                    setKakaoLoginLoading(true);
                    window.location.href = "/api/auth/kakao";
                  }}
                  disabled={kakaoLoginLoading}
                >
                  {kakaoLoginLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      카카오톡으로 로그인 중...
                    </>
                  ) : (
                    "카카오톡으로 로그인"
                  )}
                </Button>
              )}

              {/* 비밀번호 찾기 링크 */}
              <div className="text-center mt-4">
                <button
                  onClick={async () => {
                    const emailInput = document.getElementById('email');
                    if (!email) {
                      emailInput?.setAttribute('data-highlight', 'true');
                      setTimeout(() => {
                        emailInput?.setAttribute('data-highlight', 'false');
                      }, 2000);
                      toast({
                        title: "이메일 필요",
                        description: "비밀번호를 재설정할 이메일을 입력해주세요.",
                        variant: "destructive"
                      });
                      return;
                    }
                    try {
                      const success = await sendPasswordReset(email);
                      if (success) {
                        toast({
                          title: "이메일 발송 완료",
                          description: "비밀번호 재설정 링크가 이메일로 발송되었습니다."
                        });
                      }
                    } catch (error: any) {
                      toast({
                        title: "발송 실패",
                        description: error.message || "비밀번호 재설정 이메일 발송에 실패했습니다.",
                        variant: "destructive"
                      });
                    }
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-center text-gray-500 mt-4">
          로그인하면 무료로 여러 기능을 매일 사용할 수 있습니다. 
        </p>
      </CardContent>
    </Card>
  );

  if (isModal) {
    return content;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-indigo-50 p-4">
      {content}
    </div>
  );
}