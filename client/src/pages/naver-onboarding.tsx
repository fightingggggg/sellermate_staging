import { useEffect, useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { auth, db } from "@/lib/firebase";
import { signInWithCustomToken, RecaptchaVerifier, signInWithPhoneNumber, updateEmail, updateProfile, PhoneAuthProvider, linkWithCredential, ConfirmationResult } from "firebase/auth";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export default function NaverOnboarding() {
  // useLocation hook for navigation only
  // parse query
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";
  const name = searchParams.get("name") || "";
  const provider = searchParams.get("provider") || "";
  const skip = searchParams.get("skip") === "1";

  const [step, setStep] = useState<"signin" | "phone" | "done">("signin");
  const [countryCode, setCountryCode] = useState("+82");
  const [number, setNumber] = useState(""); // local number without country code
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [, navigate] = useLocation();

  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [phoneDone, setPhoneDone] = useState(false);
  const [confirmedPhone, setConfirmedPhone] = useState<string>("");
  const [awaitingLink, setAwaitingLink] = useState(false);
  const verificationIdRef = useRef<string>("");
  const verificationCodeRef = useRef<string>("");

  const [timer, setTimer] = useState(300); // 5 minutes

  const buildE164 = (code: string, raw: string) => {
    const clean = raw.replace(/[^0-9]/g, "");
    if (code === "+82" && clean.startsWith("0")) return code + clean.slice(1);
    return code + clean;
  };

  // 1) Custom token 로그인
  useEffect(() => {
    (async () => {
      if (!token) return;
      if (skip) {
        try {
          await signInWithCustomToken(auth, token);
          navigate("/");
        } catch (err) {
          console.error("[ONBOARDING] auto-login failed", err);
        }
        return;
      }
      // Custom token login postponed until 가입 완료
      setStep("phone");
    })();
  }, [token, skip]);

  // effect for countdown
  useEffect(()=>{
    if(!codeSent) return;
    if(timer===0) return;
    const id=setInterval(()=>setTimer(t=>t-1),1000);
    return ()=>clearInterval(id);
  },[codeSent,timer]);

  const formatTime=(s:number)=>{
    const m=Math.floor(s/60).toString().padStart(2,"0");
    const sec=(s%60).toString().padStart(2,"0");
    return `${m}:${sec}`;
  };

  const sendCode = async () => {
    if (!number) return;
    setLoading(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
        await recaptchaRef.current.render();
      }
      const phoneNumber = buildE164(countryCode, number);

      // 휴대폰 번호 중복 여부 확인
      try {
        const usersRef = collection(db, "usersInfo");
        const q = query(usersRef, where("number", "==", phoneNumber));
        const existing = await getDocs(q);
        if (!existing.empty) {
          toast({
            variant: "destructive",
            title: "가입 불가",
            description: "이미 가입된 휴대폰 번호입니다.",
          });
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("[DUP_CHECK] 휴대폰 번호 중복 확인 실패", err);
      }

      const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaRef.current!);
      (window as any).confirmationResult = result;
      verificationIdRef.current = result.verificationId;
      setCodeSent(true);
      toast({
        title: "인증번호 발송 📱",
        description: "입력하신 번호로 인증번호를 전송했어요. 5분 안에 입력해주세요!",
      });
    } catch (err: any) {
      console.error(err);
      let description: string;
      if (err?.code === "auth/too-many-requests") {
        description = "너무 많이 시도했습니다. 잠시 후 재시도해 주세요.";
      } else if (err?.code === "auth/invalid-app-credential") {
        description = "인증번호 전송에 실패했어요. 잠시후 다시 시도해주세요.";
      } else if (err?.code === "auth/invalid-phone-number") {
        const msg = err?.message || "";
        if (msg.includes("Invalid format")) {
          description = "전화번호가 아닌 것 같아요. 번호 숫자를 입력해주세요.";
        } else if (msg.includes("TOO_LONG")) {
          description = "번호가 너무 길어요. 올바른 번호를 입력해주세요.";
        } else {
          description = "휴대폰 번호 형식이 올바르지 않습니다.";
        }
      } else {
        description = err?.message || "인증번호를 보내지 못했어요. 잠시 후 다시 시도해주세요.";
      }
      toast({
        variant: "destructive",
        title: "인증번호 발송 실패",
        description,
      });
    } finally {
      setLoading(false);
    }
  };

  // verifyCode 단계에서는 SMS 코드 형식만 검증하고, 실제 credential 사용은 가입 완료 단계에서 한 번만 수행합니다.
  const verifyCode = async () => {
    // 사용자가 입력한 코드 길이만 간단히 확인 (4자리 이상)
    if (verificationCode.length < 4) return;

    // 코드와 verificationId 를 나중에 credential 생성에 재사용하기 위해 보관합니다.
    const result = (window as any).confirmationResult as ConfirmationResult | undefined;
    if (!result) {
      alert("인증번호를 다시 요청해주세요.");
      return;
    }

    verificationIdRef.current = result.verificationId;
    verificationCodeRef.current = verificationCode;

    // UI 표시용 – 실제 credential 검증은 가입 완료 단계(linkWithCredential)에서 1회만 수행
    const phoneNum = buildE164(countryCode, number);
    setConfirmedPhone(phoneNum);
    setPhoneDone(true);
    setStep("done");
  };

  if (step === "signin") {
    // 로딩 화면을 숨기고 현재 화면 유지
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6 max-w-xs mx-auto">
      <img src="/logo.png" alt="스토어 부스터" className="h-8" />
      <h1 className="text-center font-semibold">본인확인을 위해<br/>휴대폰 번호를 입력해주세요</h1>

      <Label htmlFor="email" className="self-start">이메일</Label>
      <Input id="email" value={email} readOnly disabled className="bg-gray-50" />
      {name && (
        <>
          <Label htmlFor="name" className="self-start mt-2">이름</Label>
          <Input id="name" value={name} readOnly disabled className="bg-gray-50" />
        </>
      )}

      <Label htmlFor="phone" className="self-start">휴대폰 번호</Label>
      <div className="flex space-x-2 w-full">
        {/* 국가 코드는 한국(+82)만 지원하도록 읽기 전용으로 고정 */}
        <select
          value={countryCode}
          disabled
          className="border rounded-md text-sm h-10 px-2 bg-gray-100 cursor-not-allowed"
        >
          <option value="+82">🇰🇷 +82</option>
        </select>
        <Input id="phone" className="flex-1" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="번호만 입력" />
      </div>
      {!codeSent && (
        <Button disabled={loading || !number} onClick={sendCode} className="bg-blue-600 hover:bg-blue-700 w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "인증번호 발송"}
        </Button>
      )}
      {codeSent && (
        <>
          <Label htmlFor="code">인증번호</Label>
          <div className="relative w-full">
            <Input id="code" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="인증번호 입력" />
            {!phoneDone && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-600 text-sm select-none">
                {formatTime(timer)}
              </span>
            )}
          </div>
          {phoneDone ? (
            <Button disabled variant="outline" className="w-full mt-2">인증완료</Button>
          ) : (
            <Button disabled={loading || verificationCode.length < 4} onClick={verifyCode} className="bg-blue-600 hover:bg-blue-700 w-full mt-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "확인"}
            </Button>
          )}

        </>
      )}
      <div id="recaptcha-container" />

      {/* 재발송 버튼 위치 */}
      {codeSent && (
        <Button
          disabled={loading || timer > 0}
          onClick={() => { sendCode(); setTimer(300); }}
          variant="outline"
          className="w-full mt-4"
        >
          인증번호 재발송
        </Button>
      )}
      <div className="w-full space-y-4 mt-4">
        <div className="flex items-center space-x-2">
          <Checkbox id="terms" checked={terms} onCheckedChange={(v)=>setTerms(v as boolean)} />
          <label htmlFor="terms" className="text-sm">
            <a href="https://chambray-midnight-e7f.notion.site/22c78708053f80998563d392eadb9152" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">이용약관</a>에 동의합니다
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="privacy" checked={privacy} onCheckedChange={(v)=>setPrivacy(v as boolean)} />
          <label htmlFor="privacy" className="text-sm">
            <a href="https://chambray-midnight-e7f.notion.site/18678708053f806a9955f0f5375cdbdd" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">개인정보 처리방침</a>에 동의합니다
          </label>
        </div>
        <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={!terms || !privacy || !phoneDone || submitLoading} onClick={async ()=>{
            try{
              setSubmitLoading(true);
              await signInWithCustomToken(auth, token);

              // Auth 사용자 프로필에 이메일/이름 반영 (식별자 누락 방지)
              try {
                if (email) await updateEmail(auth.currentUser!, email);
                if (name) await updateProfile(auth.currentUser!, { displayName: name });
              } catch (e) {
                console.warn("[ONBOARDING] updateEmail/updateProfile 실패", e);
              }

              // 휴대폰 credential 링크 (식별자용)
              try {
                if (verificationIdRef.current && verificationCodeRef.current) {
                  // verificationId + code 로 credential 을 생성하고, 여기서 최초이자 단 한 번만 사용합니다.
                  const phoneCred = PhoneAuthProvider.credential(
                    verificationIdRef.current,
                    verificationCodeRef.current,
                  );
                  await linkWithCredential(auth.currentUser!, phoneCred);
                }
              } catch (err) {
                console.warn("[ONBOARDING] linkWithCredential 실패", err);
                toast({
                  variant: "destructive",
                  title: "휴대폰 번호 연결 실패",
                  description:
                    (err as any)?.message || "휴대폰 번호를 계정에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
                });
              }

              // 휴대폰 번호와 함께 이메일/이름/제공처 기록
              const profileData: Record<string, any> = {
                number: confirmedPhone,
              };
              if (email) profileData.email = email;
              if (name) profileData.name = name;
              if (provider) profileData.provider = provider;
              profileData.emailVerified = true;
              profileData.createdAt = serverTimestamp();

              await setDoc(doc(db, "usersInfo", auth.currentUser!.uid), profileData, { merge: true });
              navigate("/");
            }catch(err){
              console.error(err);
              toast({ variant: "destructive", title: "가입 실패", description: (err as any)?.message || "알 수 없는 오류가 발생했어요. 다시 시도해주세요."});
            }finally{setSubmitLoading(false);} 
        }}>{submitLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 가입 완료 중...</>) : "가입 완료"}</Button>
      </div>
    </div>
  );
} 