import { useEffect, useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { auth, db } from "@/lib/firebase";
import { signInWithCustomToken, RecaptchaVerifier, signInWithPhoneNumber, updateEmail, updateProfile, PhoneAuthProvider, linkWithCredential, ConfirmationResult, reauthenticateWithCredential } from "firebase/auth";
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
  const initialParamsRef = useRef<{
    token: string;
    email: string;
    name: string;
    provider: string;
    age: string;
    birthDate: string;
    skip: boolean;
    socialPhone: string;
    merge: boolean;
    emailUid: string;
    mergeEmail: string;
  } | null>(null);

  if (!initialParamsRef.current) {
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    );
    const searchParams = new URLSearchParams(window.location.search);
    const get = (k: string) => hashParams.get(k) ?? searchParams.get(k) ?? "";

    const tokenParsed = get("token");
    const emailParsed = get("email");
    const nameParsed = get("name");
    const providerParsed = get("provider");
    const ageParsed = get("age");
    const birthDateParsed = get("birthDate");
    const skipParsed = (hashParams.get("skip") ?? searchParams.get("skip")) === "1";
    const socialPhoneParsed = get("socialPhone");
    const mergeParsed = (hashParams.get("merge") ?? searchParams.get("merge")) === "true";
    const emailUidParsed = get("emailUid");
    const mergeEmailParsed = get("email");

    initialParamsRef.current = {
      token: tokenParsed,
      email: emailParsed,
      name: nameParsed,
      provider: providerParsed,
      age: ageParsed,
      birthDate: birthDateParsed,
      skip: skipParsed,
      socialPhone: socialPhoneParsed,
      merge: mergeParsed,
      emailUid: emailUidParsed,
      mergeEmail: mergeEmailParsed,
    };
  }

  const {
    token,
    email,
    name,
    provider,
    age,
    birthDate,
    skip,
    socialPhone,
    merge,
    emailUid,
    mergeEmail,
  } = initialParamsRef.current!;

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
  const [ageCheck, setAgeCheck] = useState(false);
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

  // 전화번호 정규화 함수 (소셜 전화번호와 입력 전화번호 비교용)
  const normalizePhoneNumber = (phone: string): string => {
    // 모든 공백, 하이픈, 괄호 제거하고 숫자만 추출
    const clean = phone.replace(/[\s\-\(\)]/g, "");
    
    // +82로 시작하면 한국 번호로 처리
    if (clean.startsWith("+82")) {
      const number = clean.substring(3); // +82 제거
      // 10으로 시작하면 010으로 변환
      if (number.startsWith("10")) {
        return `010${number.substring(2)}`;
      }
      return number;
    }
    
    // 010으로 시작하는 경우
    if (clean.startsWith("010")) {
      return clean;
    }
    
    // 10으로 시작하는 경우 010 추가
    if (clean.startsWith("10")) {
      return `010${clean.substring(2)}`;
    }
    
    return clean;
  };

  // 전화번호 비교 함수 (더 정확한 비교를 위해)
  const comparePhoneNumbers = (phone1: string, phone2: string): boolean => {
    const normalized1 = normalizePhoneNumber(phone1);
    const normalized2 = normalizePhoneNumber(phone2);
    
    // 디버그용 로그
    console.log("[PHONE_COMPARE]", {
      original1: phone1,
      original2: phone2,
      normalized1,
      normalized2,
      match: normalized1 === normalized2
    });
    
    return normalized1 === normalized2;
  };

  // 민감 파라미터는 즉시 URL에서 제거하여 유출 최소화
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.hash) {
      history.replaceState({}, document.title, url.pathname);
    } else if (url.search) {
      url.search = "";
      history.replaceState({}, document.title, url.toString());
    }
  }, []);

  // 1) skip=1(이미 휴대폰 인증 완료된 계정)인 경우에만 즉시 로그인 후 홈으로 이동합니다.
  useEffect(() => {
    (async () => {
      if (!token || !skip) {
        // 휴대폰 인증이 필요한 신규 가입자는 로그인 지연
        setStep("phone");
        return;
      }

      try {
        await signInWithCustomToken(auth, token);
        navigate("/");
      } catch (err) {
        console.error("[ONBOARDING] auto-login skipped user failed", err);
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

      // 소셜에서 가져온 전화번호와 입력한 전화번호 비교
      // if (socialPhone) {
      //   if (!comparePhoneNumbers(socialPhone, number)) {
      //     toast({
      //       variant: "destructive",
      //       title: "전화번호 불일치",
      //       description: `${provider === "naver" ? "네이버" : "카카오"}에 등록된 전화번호와 입력하신 전화번호가 다릅니다. 동일한 휴대폰 번호를 입력해주세요.`,
      //     });
      //     setLoading(false);
      //     return;
      //   }
      // }

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

      // 소셜 로그인인 경우: 이미 로그인된 상태에서 전화번호 인증만 받기
      if (provider && (provider === "naver" || provider === "kakao")) {
        // 이미 소셜로 로그인된 상태에서 전화번호 인증번호만 발송
        const phoneAuthProvider = new PhoneAuthProvider(auth);
        const verificationId = await phoneAuthProvider.verifyPhoneNumber(
          phoneNumber,
          recaptchaRef.current!
        );
        verificationIdRef.current = verificationId;
        (window as any).verificationId = verificationId;
        setCodeSent(true);
        toast({
          title: "인증번호 발송 📱",
          description: "입력하신 번호로 인증번호를 전송했어요. 5분 안에 입력해주세요!",
        });
      } else {
        // 이메일 회원가입인 경우: 기존 방식 유지
        const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaRef.current!);
        (window as any).confirmationResult = result;
        verificationIdRef.current = result.verificationId;
        setCodeSent(true);
        toast({
          title: "인증번호 발송 📱",
          description: "입력하신 번호로 인증번호를 전송했어요. 5분 안에 입력해주세요!",
        });
      }
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

  // 인증번호를 실제로 검증하고, 성공 시 서버에서 모든 처리를 합니다.
  const verifyCode = async () => {
    if (verificationCode.length < 4) return;

    // 아직 로그인되지 않았다면 여기서 custom token 으로 로그인 후 진행
    if (!auth.currentUser) {
      try {
        await signInWithCustomToken(auth, token);
      } catch (loginErr) {
        console.error("[ONBOARDING] custom token login 실패", loginErr);
        toast({ variant: "destructive", title: "로그인 실패", description: "다시 시도해주세요." });
        return;
      }
    }

    setLoading(true);
    // try/catch 바깥에서 참조할 수 있도록 변수 선선언
    let phoneNum = "";
    try {
      phoneNum = buildE164(countryCode, number);
      
      // 소셜 로그인인 경우: 전화번호를 현재 소셜 계정에 연결
      if (provider && (provider === "naver" || provider === "kakao")) {
        if (!auth.currentUser) {
          throw new Error("로그인된 사용자가 없습니다.");
        }
        const verificationId = verificationIdRef.current || (window as any).verificationId;
        if (!verificationId) {
          throw new Error("인증 세션이 만료되었습니다. 인증번호를 다시 요청해주세요.");
        }
        const credential = PhoneAuthProvider.credential(verificationId, verificationCode);
        try {
          await linkWithCredential(auth.currentUser, credential);
          console.log("[ONBOARDING] 소셜 계정에 전화번호 연결 완료");
        } catch (linkErr: any) {
          if (linkErr?.code === "auth/provider-already-linked") {
            // 이미 전화번호 제공자가 연결되어 있는 경우, 현재 계정의 전화번호와 사용자가 입력한 번호가 동일한지 확인합니다.
            const currentPhone = auth.currentUser?.phoneNumber || "";
            if (currentPhone && comparePhoneNumbers(currentPhone, phoneNum)) {
              try {
                // 이미 연결된 전화번호라면 재인증(reauthenticate)으로 SMS 코드 유효성만 확인
                await reauthenticateWithCredential(auth.currentUser, credential);
                console.log("[ONBOARDING] 기존 전화번호 재인증 성공");
              } catch (reauthErr: any) {
                console.error("[ONBOARDING] 재인증 실패", reauthErr);
                throw reauthErr; // 코드가 잘못된 경우 에러 전파
              }
            } else {
              // 다른 번호가 이미 연결된 경우 예외 처리
              console.error("[ONBOARDING] 다른 전화번호가 이미 연결되어 있어 인증에 실패합니다.");
              throw linkErr;
            }
          } else {
            throw linkErr;
          }
        }
      } else {
        // 이메일 회원가입인 경우: 기존 방식 유지
        const confirmationResult = (window as any).confirmationResult;
        if (!confirmationResult) {
          toast({ variant: "destructive", title: "인증 오류", description: "인증번호를 다시 요청해주세요." });
          return;
        }
        await confirmationResult.confirm(verificationCode);
        console.log("[ONBOARDING] 휴대폰 인증 코드 검증 완료");
      }

      setConfirmedPhone(phoneNum);
      setPhoneDone(true);
      setStep("done");
      console.log("[ONBOARDING] 휴대폰 인증 완료:", phoneNum);
      toast({ title: "인증 완료", description: "휴대폰 번호 인증이 완료되었습니다." });
    } catch (err: any) {
      console.error("[ONBOARDING] 휴대폰 인증 실패", err);
      let msg: string;
      if (err?.code === "auth/provider-already-linked") {
        // 이미 전화번호 제공자가 연결되어 있는 경우 입력한 번호와 동일한지 확인합니다.
        const currentPhone = auth.currentUser?.phoneNumber || "";
        if (currentPhone && comparePhoneNumbers(currentPhone, phoneNum)) {
          try {
            // credential은 try 블록 내부에서만 선언되었으므로 여기서는 재생성
            const verificationId = verificationIdRef.current || (window as any).verificationId;
            if (verificationId) {
              const credential = PhoneAuthProvider.credential(verificationId, verificationCode);
              await reauthenticateWithCredential(auth.currentUser!, credential);
              console.log("[ONBOARDING] 기존 전화번호 재인증 성공(outer catch)");
            }
          } catch (reauthErr) {
            console.error("[ONBOARDING] 재인증 실패(outer catch)", reauthErr);
            toast({ variant: "destructive", title: "인증 실패", description: "인증번호가 올바르지 않습니다." });
            return;
          }
          setPhoneDone(true);
          setStep("done");
          toast({ title: "이미 인증됨", description: "해당 계정에는 이미 동일한 휴대폰 번호가 연결되어 있습니다." });
          return;
        }
        // 번호가 다르면 오류 처리
        toast({ variant: "destructive", title: "인증 실패", description: "다른 휴대폰 번호가 이미 연결되어 있습니다." });
        return;
      }
      if (err?.code === "auth/invalid-verification-code" || err?.message?.includes("invalid-verification-code")) {
        msg = "인증번호가 올바르지 않아요. 다시 입력해주세요.";
      } else if (err?.code === "auth/invalid-verification-id") {
        msg = "인증 세션이 만료되었습니다. 인증번호를 다시 요청해주세요.";
      } else if (err?.code === "auth/code-expired") {
        msg = "인증번호가 만료되었습니다. 새로운 인증번호를 요청해주세요.";
      } else if (err?.code === "auth/credential-already-in-use") {
        msg = "이미 다른 계정에서 사용 중인 전화번호입니다.";
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
          <Checkbox id="ageCheck" checked={ageCheck} onCheckedChange={(v)=>setAgeCheck(v as boolean)} />
          <label htmlFor="ageCheck" className="text-sm">
            만 14세 이상입니다
          </label>
        </div>
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
        <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={!ageCheck || !terms || !privacy || !phoneDone || submitLoading}         onClick={async ()=>{
            try{
              setSubmitLoading(true);
              
              // 휴대폰 인증이 완료된 상태에서 소셜 계정으로 다시 로그인
              await signInWithCustomToken(auth, token);

              // 계정 병합이 필요한 경우
              if (merge && emailUid && mergeEmail) {
                try {
                  console.log("[ONBOARDING] 계정 병합 시작:", { emailUid, socialUid: auth.currentUser!.uid });
                  
                  // 서버 API를 사용하여 계정 병합
                  const mergeResponse = await fetch('/api/auth/merge-account', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      emailAccountUid: emailUid,
                      socialProvider: provider === 'naver' ? 'naver' : 'kakao',
                      socialUid: auth.currentUser!.uid,
                      email: mergeEmail,
                      phoneNumber: confirmedPhone,
                      birthDate: birthDate,
                      socialName: name,
                      socialEmail: email,
                    }),
                  });

                  const mergeData = await mergeResponse.json();

                  if (!mergeResponse.ok) {
                    throw new Error(mergeData.message || '계정 병합에 실패했습니다.');
                  }

                  if (mergeData.success && mergeData.customToken) {
                    // 병합된 소셜 계정으로 다시 로그인
                    await signInWithCustomToken(auth, mergeData.customToken);
                    
                    // 계정 병합 후 휴대폰 번호가 제대로 설정되었는지 확인하고 필요시 재설정
                    console.log("[ONBOARDING] 계정 병합 완료, 현재 사용자:", auth.currentUser);
                    console.log("[ONBOARDING] 휴대폰 번호:", auth.currentUser?.phoneNumber);
                    
                    // 휴대폰 번호가 없으면 다시 설정
                    if (!auth.currentUser?.phoneNumber) {
                      try {
                        const idToken = await auth.currentUser?.getIdToken?.();
                        await fetch('/api/auth/update-phone', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                          },
                          body: JSON.stringify({
                            uid: auth.currentUser!.uid,
                            phoneNumber: confirmedPhone
                          }),
                        });
                        console.log("[ONBOARDING] 계정 병합 후 휴대폰 번호 재설정 완료:", confirmedPhone);
                      } catch (phoneError) {
                        console.warn("[ONBOARDING] 계정 병합 후 휴대폰 번호 재설정 실패:", phoneError);
                      }
                    }
                    
                    toast({
                      title: "계정 병합 완료",
                      description: "이메일 계정이 소셜 계정과 성공적으로 병합되었습니다.",
                    });

                    // 구독 페이지로 리다이렉트 (계정 병합 완료 플래그와 함께)
                    navigate("/subscription?mergeComplete=true");
                    return;
                  }
                } catch (mergeError: any) {
                  console.error('Account merge error:', mergeError);
                  toast({
                    title: "계정 병합 실패",
                    description: mergeError.message || "계정 병합 중 오류가 발생했습니다.",
                    variant: "destructive"
                  });
                  return;
                }
              }

              // Auth 사용자 프로필에 이메일/이름 반영 (식별자 누락 방지)
              try {
                if (email) await updateEmail(auth.currentUser!, email);
                if (name) await updateProfile(auth.currentUser!, { displayName: name });
              } catch (e) {
                console.warn("[ONBOARDING] updateEmail/updateProfile 실패", e);
              }

              // Firebase Auth에 휴대폰 번호 설정 (식별자 표시를 위해 필수)
              // 소셜 로그인의 경우 linkWithCredential로 연결되었지만, 식별자 표시를 위해 추가 설정 필요
              try {
                const idToken = await auth.currentUser?.getIdToken?.();
                await fetch('/api/auth/update-phone', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                  },
                  body: JSON.stringify({
                    uid: auth.currentUser!.uid,
                    phoneNumber: confirmedPhone
                  }),
                });
                console.log("[ONBOARDING] Firebase Auth 휴대폰 번호 설정 완료:", confirmedPhone);
              } catch (phoneError) {
                console.warn("[ONBOARDING] Firebase Auth 휴대폰 번호 설정 실패:", phoneError);
                // 휴대폰 번호 설정 실패 시에도 계속 진행 (Firestore 데이터는 저장)
              }

              // 휴대폰 번호와 함께 이메일/이름/제공처 기록
              const profileData: Record<string, any> = {
                number: confirmedPhone,
              };
              if (email) profileData.email = email;
              if (name) profileData.name = name;
              if (provider) profileData.provider = provider;
              if (birthDate) profileData.birthDate = birthDate;
              profileData.emailVerified = true;
              profileData.createdAt = serverTimestamp();

              await setDoc(doc(db, "usersInfo", auth.currentUser!.uid), profileData, { merge: true });
              navigate("/");
            }catch(err){
              console.error(err);
              toast({ variant: "destructive", title: "가입 실패", description: (err as any)?.message || "알 수 없는 오류가 발생했어요. 다시 시도해주세요."});
            }finally{setSubmitLoading(false);} 
        }}>{submitLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {merge ? "계정 병합 중..." : "가입 완료 중..."}</>) : (merge ? "계정 병합 완료" : "가입 완료")}</Button>
      </div>
    </div>
  );
} 