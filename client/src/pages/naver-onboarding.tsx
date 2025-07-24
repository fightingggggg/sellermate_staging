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
  const age = searchParams.get("age") || "";
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

  // 1) 최초 페이지 진입 시 Custom token 으로 로그인하여
  //    이후 휴대폰 credential 을 바로 currentUser 에 연결할 수 있도록 합니다.
  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        await signInWithCustomToken(auth, token);

        if (skip) {
          navigate("/");
          return;
        }

        // 로그인 성공 후 휴대폰 인증 단계로 진입
        setStep("phone");
      } catch (err) {
        console.error("[ONBOARDING] auto-login failed", err);
      }
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

  // 인증번호를 실제로 검증하고, 성공 시 현재 소셜 계정에 휴대폰 자격 증명을 즉시 연결합니다.
  const verifyCode = async () => {
    if (verificationCode.length < 4) return;

    if (!auth.currentUser) {
      toast({
        variant: "destructive",
        title: "로그인 필요",
        description: "잠시 후 다시 시도해주세요.",
      });
      return;
    }

    const verId =
      verificationIdRef.current ||
      (window as any).confirmationResult?.verificationId;

    if (!verId) {
      alert("인증번호를 다시 요청해주세요.");
      return;
    }

    setLoading(true);
    try {
      const phoneCred = PhoneAuthProvider.credential(verId, verificationCode);

      // 입력한 코드가 올바른지 확인하면서 동시에 휴대폰 번호를 계정에 연결합니다.
      await linkWithCredential(auth.currentUser, phoneCred);

      verificationIdRef.current = verId;
      verificationCodeRef.current = verificationCode;

      const phoneNum = buildE164(countryCode, number);
      setConfirmedPhone(phoneNum);
      setPhoneDone(true);
      setStep("done");

      toast({ title: "인증 완료", description: "휴대폰 번호 인증이 완료되었습니다." });
    } catch (err: any) {
      console.error("[ONBOARDING] 휴대폰 인증 실패", err);
      let msg: string;
      if (err?.code === "auth/invalid-verification-code") {
        msg = "인증번호가 올바르지 않아요. 다시 입력해주세요.";
      } else if (err?.code === "auth/credential-already-in-use") {
        msg = "이미 사용 중인 휴대폰 번호입니다.";
      } else {
        msg = err?.message || "휴대폰 인증에 실패했습니다.";
      }
      toast({ variant: "destructive", title: "인증 실패", description: msg });
    } finally {
      setLoading(false);
    }
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

              // 휴대폰 credential 은 이미 verify 단계에서 연결되었으므로 별도 작업이 필요 없습니다.

              // 휴대폰 번호와 함께 이메일/이름/제공처 기록
              const profileData: Record<string, any> = {
                number: confirmedPhone,
              };
              if (email) profileData.email = email;
              if (name) profileData.name = name;
              if (provider) profileData.provider = provider;
              if (age) profileData.ageGroup = age;
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