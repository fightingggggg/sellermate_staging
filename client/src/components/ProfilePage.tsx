import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/contexts/UsageContext";
import { useHistoryLimit } from "@/hooks/useHistoryLimit";
import { useToast } from "@/hooks/use-toast";
import { UserProfile } from "@/types";
import { db, auth } from "@/lib/firebase"; // db는 initializeApp 후에 만든 Firestore 인스턴스
import { maskCardNumber, formatCardNumberWithPrefix } from "@/lib/utils";
import { collection, addDoc, serverTimestamp, setDoc, doc, query, where, orderBy, limit, getDocs, getDoc } from "firebase/firestore";

// UI 컴포넌트 import
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserRound, Search, Sparkles, Crown, CreditCard, BarChart3, History, Wallet } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import BillingKeyForm from "@/components/BillingKeyForm";

// 프로필 업데이트 스키마
const profileSchema = z.object({
  businessName: z.string().min(1, "스마트스토어 상호명을 입력해주세요"),
  businessLink: z.string().url("올바른 URL 형식을 입력해주세요"),
  number: z.string().min(1, "휴대폰 번호를 입력해주세요"),
});

// 회원탈퇴 스키마 (비밀번호 입력 제거)
const deleteAccountSchema = z.object({
  reason: z.string().min(10, "탈퇴 사유를 10자 이상 입력해주세요"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const { 
    userProfile, 
    profileLoading, 
    updateUserProfile, 
    deleteUserAccount, 
    logout,
    error: authError,
    sendPasswordReset, // Added sendPasswordReset function
    currentUser // Added currentUser
  } = useAuth();
  const { usageInfo, isLoading: usageLoading } = useUsage();
  const { currentCount: historyCurrent, maxCount: historyMax, isLoading: historyLoading } = useHistoryLimit();

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const provider = (userProfile as any)?.provider;
  const isSocial = provider === "naver" || provider === "kakao";
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteWarnOpen, setDeleteWarnOpen] = useState(false); // 30일 재가입 제한 안내용
  const [cancelMembershipOpen, setCancelMembershipOpen] = useState(false);
  const [isCancellingMembership, setIsCancellingMembership] = useState(false);
  const [reactivateMembershipOpen, setReactivateMembershipOpen] = useState(false);
  const [isReactivatingMembership, setIsReactivatingMembership] = useState(false);
  const [deleteBillingKeyOpen, setDeleteBillingKeyOpen] = useState(false);
  const [isDeletingBillingKey, setIsDeletingBillingKey] = useState(false);
  const [cancelPaymentOpen, setCancelPaymentOpen] = useState(false);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelMembershipReason, setCancelMembershipReason] = useState("");
  const [billingKeyChangeOpen, setBillingKeyChangeOpen] = useState(false);
  const [billingKeyRegisterOpen, setBillingKeyRegisterOpen] = useState(false);
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const { toast } = useToast();

  // 구독 정보 상태
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'none' | 'active' | 'cancelled' | 'expired'>('none');
  
  // 결제 수단 정보 상태
  const [billingKeyInfo, setBillingKeyInfo] = useState<any>(null);
  const [billingKeyLoading, setBillingKeyLoading] = useState(false);

  // 프로필 폼
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      businessName: userProfile?.businessName || "",
      businessLink: userProfile?.businessLink || "",
      number: userProfile?.number || "",
    },
  });

  // 회원탈퇴 폼
  const deleteAccountForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      reason: "",
    },
  });

  // 프로필 폼 제출 핸들러
  const onProfileSubmit = async (data: ProfileFormValues) => {
    setIsProfileLoading(true);
    try {
      const success = await updateUserProfile(data as Partial<UserProfile>);
      if (success) {
        toast({
          title: "프로필 업데이트 성공",
          description: "프로필 정보가 성공적으로 업데이트되었습니다.",
        });
      }
    } catch (error: any) {
      toast({
        title: "프로필 업데이트 실패",
        description: error.message || "프로필 업데이트 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsProfileLoading(false);
    }
  };


  const onDeleteSubmit = async (data: DeleteAccountFormValues) => {
    setIsDeleteLoading(true);
    try {
      // 구독 상태 확인
      if (subscriptionStatus === 'active') {
        toast({
          title: "계정 탈퇴 불가",
          description: "현재 구독 중입니다. 구독을 해지한 후 탈퇴해주세요.",
          variant: "destructive",
        });
        return;
      }
      
      if (subscriptionStatus === 'cancelled') {
        toast({
          title: "계정 탈퇴 불가",
          description: "구독이 해지되었지만 만료일까지 서비스를 이용할 수 있습니다. 만료 후 탈퇴해주세요.",
          variant: "destructive",
        });
        return;
      }

      // 1. 탈퇴 사유를 먼저 저장
      let deletionRefId: string;
      try {
        deletionRefId = auth.currentUser?.uid ?? userProfile?.uid ?? Math.random().toString(36).substr(2, 9);
        const deletionData: Record<string, any> = {
          reason: data.reason,
          timestamp: serverTimestamp(),
        };
        if (userProfile?.email) deletionData.email = userProfile.email;
        if (userProfile?.number) deletionData.number = userProfile.number;
        if (userProfile?.businessLink) deletionData.link = userProfile.businessLink;
        if (userProfile?.name) deletionData.name = userProfile.name;
        else if (userProfile?.businessName) deletionData.name = userProfile.businessName;

        await setDoc(doc(db, "accountDeletions", deletionRefId), deletionData);
      } catch (deletionDataError) {
        console.error("탈퇴 사유 저장 실패:", deletionDataError);
        toast({
          title: "회원 탈퇴 실패",
          description: "탈퇴 사유 저장 중 오류가 발생했습니다. 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      // 2. Firebase Auth 삭제 시도
      const result = await deleteUserAccount(deletionRefId);
      
      if (result.success) {
        toast({
          title: "회원 탈퇴 완료",
          description: "계정이 성공적으로 삭제되었습니다.",
        });
        setDeleteDialogOpen(false);
        navigate("/");
      } else {
        // result.error에 구체적인 에러 메시지가 포함되어 있음
        const errorMessage = result.error || "계정 탈퇴에 실패했습니다. 다시 시도해주세요.";
        toast({
          title: "회원 탈퇴 실패",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("회원 탈퇴 중 오류:", error); // 디버깅용 콘솔 출력
      
      // 에러 메시지를 더 견고하게 처리
      const errorMessage = 
        error?.response?.data?.message || 
        error?.message || 
        "회원 탈퇴 중 오류가 발생했습니다.";
      
      toast({
        title: "회원 탈퇴 실패",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeleteLoading(false);
    }
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (error: any) {
      toast({
        title: "로그아웃 실패",
        description: error.message || "로그아웃 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  // 멤버십 해지 처리
  const handleCancelMembership = async () => {
    setIsCancellingMembership(true);
    try {
      const trimmed = cancelMembershipReason.trim();
      if (trimmed.length < 10) {
        toast({
          title: "해지 사유가 짧습니다",
          description: "해지 사유는 10자 이상 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
      // uid 가져오기
      let possibleUid = currentUser?.uid;
      
      if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
        const numberWithoutPlus = userProfile.number.replace('+82', '');
        possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
      }
      
      if (!possibleUid) {
        throw new Error('사용자 ID를 찾을 수 없습니다.');
      }

      // 멤버십 해지 API 호출
      const cancelHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const token = await auth.currentUser?.getIdToken?.();
        if (token) cancelHeaders.Authorization = `Bearer ${token}`;
      } catch {}
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: cancelHeaders,
        body: JSON.stringify({ uid: possibleUid, reason: trimmed }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '멤버십 해지에 실패했습니다.');
      }

      // 성공 시 구독 정보 새로고침
      await fetchSubscriptionInfo();
      
      // 해지 사유 Firestore 기록 (subscriptionCancellations/{uid})
      try {
        await setDoc(
          doc(db, "subscriptionCancellations", possibleUid),
          {
            cancelReason: trimmed,
            cancelledAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (logError) {
        console.error("해지 사유 기록 실패:", logError);
      }
      
      toast({
        title: "멤버십 해지 완료",
        description: "멤버십이 성공적으로 해지되었습니다. 다음 결제일까지는 서비스를 이용하실 수 있습니다.",
      });
      setCancelMembershipOpen(false);
      setCancelMembershipReason("");
    } catch (error: any) {
      toast({
        title: "멤버십 해지 실패",
        description: error.message || "멤버십 해지 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsCancellingMembership(false);
    }
  };

  // 멤버십 재활성화 처리
  const handleReactivateMembership = async () => {
    setIsReactivatingMembership(true);
    try {
      // uid 가져오기
      let possibleUid = currentUser?.uid;
      
      if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
        const numberWithoutPlus = userProfile.number.replace('+82', '');
        possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
      }
      
      if (!possibleUid) {
        throw new Error('사용자 ID를 찾을 수 없습니다.');
      }

      // 멤버십 재활성화 API 호출
      const reactivateHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const token = await auth.currentUser?.getIdToken?.();
        if (token) reactivateHeaders.Authorization = `Bearer ${token}`;
      } catch {}
      const response = await fetch('/api/subscription/reactivate', {
        method: 'POST',
        headers: reactivateHeaders,
        body: JSON.stringify({ uid: possibleUid }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '멤버십 재활성화에 실패했습니다.');
      }

      // 성공 시 구독 정보 새로고침
      await fetchSubscriptionInfo();
      
      toast({
        title: "멤버십 재활성화 완료",
        description: "멤버십이 성공적으로 재활성화되었습니다. 정기 결제가 다시 시작됩니다.",
      });
      setReactivateMembershipOpen(false);
    } catch (error: any) {
      toast({
        title: "멤버십 재활성화 실패",
        description: error.message || "멤버십 재활성화 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsReactivatingMembership(false);
    }
  };

  // 결제수단 삭제 처리
  const handleDeleteBillingKey = async () => {
    setIsDeletingBillingKey(true);
    try {
      // uid 가져오기
      let possibleUid = currentUser?.uid;
      
      if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
        const numberWithoutPlus = userProfile.number.replace('+82', '');
        possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
      }
      
      if (!possibleUid) {
        throw new Error('사용자 ID를 찾을 수 없습니다.');
      }

      // 결제수단 삭제 API 호출
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const token = await auth.currentUser?.getIdToken?.();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {}
      const response = await fetch(`/api/billing-key/${possibleUid}`, {
        method: 'DELETE',
        headers,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '결제수단 삭제에 실패했습니다.');
      }

      // 성공 시 결제수단 정보 새로고침
      await fetchBillingKeyInfo();
      
      toast({
        title: "결제수단 삭제 완료",
        description: "결제수단이 성공적으로 삭제되었습니다.",
      });
      setDeleteBillingKeyOpen(false);
    } catch (error: any) {
      toast({
        title: "결제수단 삭제 실패",
        description: error.message || "결제수단 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingBillingKey(false);
    }
  };

  // 결제 취소 처리 (7일 이내, 사용량 0인 경우)
  const handleCancelPayment = async () => {
    // 사유 검증
    const trimmed = cancelReason.trim();
    if (trimmed.length < 10) {
      toast({
        title: "취소 사유가 짧습니다",
        description: "취소 사유는 10자 이상 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    setIsCancellingPayment(true);
    try {
      // uid 가져오기
      let possibleUid = currentUser?.uid;
      
      if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
        const numberWithoutPlus = userProfile.number.replace('+82', '');
        possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
      }
      
      if (!possibleUid) {
        throw new Error('사용자 ID를 찾을 수 없습니다.');
      }

      // 결제 취소 API 호출
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const token = await auth.currentUser?.getIdToken?.();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {}

      const response = await fetch('/api/payment/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ uid: possibleUid, reason: trimmed }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '결제 취소에 실패했습니다.');
      }

      // 성공 시 구독 정보 새로고침
      await fetchSubscriptionInfo();
      
      toast({
        title: "결제 취소 완료",
        description: "결제가 성공적으로 취소되었습니다. 환불은 영업일 기준 1-2일 내에 처리됩니다.",
      });
      setCancelPaymentOpen(false);
    } catch (error: any) {
      toast({
        title: "결제 취소 실패",
        description: error.message || "결제 취소 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsCancellingPayment(false);
    }
  };

  // 구독 정보 가져오기
  const fetchSubscriptionInfo = async () => {
    console.log('전체 userProfile 객체:', userProfile);
    console.log('currentUser 객체:', currentUser);
    console.log('userProfile의 모든 키:', Object.keys(userProfile || {}));
    
    // Firebase Auth 정보 확인
    console.log('Firebase Auth 현재 사용자:', auth.currentUser);
    console.log('Firebase Auth UID:', auth.currentUser?.uid);
    console.log('Firebase Auth Email:', auth.currentUser?.email);
    
    // currentUser에서 uid를 가져오거나, userProfile에서 provider 기반으로 uid 생성
    let possibleUid = currentUser?.uid;
    
    if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
      // provider와 number를 조합하여 uid 생성 (예: kakao_4359614198)
      const numberWithoutPlus = userProfile.number.replace('+82', '');
      possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
      console.log('생성된 uid:', possibleUid);
    }
    
    if (!possibleUid) {
      console.log('uid를 찾을 수 없음. userProfile:', userProfile, 'currentUser:', currentUser);
      return;
    }
    
    console.log('사용할 uid:', possibleUid);
    setSubscriptionLoading(true);
    try {
      const subscriptionsRef = collection(db, 'subscriptions');
      const q = query(
        subscriptionsRef,
        where('uid', '==', possibleUid),
        where('status', 'in', ['ACTIVE', 'CANCELLED', 'EXPIRED']),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      console.log('쿼리 실행 중...');
      const querySnapshot = await getDocs(q);
      console.log('쿼리 결과 - 문서 개수:', querySnapshot.size);
      
      if (!querySnapshot.empty) {
        const subscriptionDoc = querySnapshot.docs[0];
        const subscriptionData = {
          id: subscriptionDoc.id,
          ...subscriptionDoc.data()
        };
        console.log('구독 정보 로드됨:', subscriptionData);
        setSubscriptionInfo(subscriptionData);
        
        // 구독 상태 설정
        const now = new Date();
        const endDate = (subscriptionData as any).endDate?.toDate ? (subscriptionData as any).endDate.toDate() : new Date((subscriptionData as any).endDate);
        
        if ((subscriptionData as any).status === 'ACTIVE') {
          setSubscriptionStatus('active');
        } else if ((subscriptionData as any).status === 'CANCELLED' && endDate > now) {
          setSubscriptionStatus('cancelled');
        } else {
          setSubscriptionStatus('expired');
        }
      } else {
        console.log('활성 구독 정보 없음 - 전체 구독 문서 확인');
        // 전체 구독 문서 확인
        const allSubscriptionsQuery = query(
          subscriptionsRef,
          where('uid', '==', possibleUid)
        );
        const allSubscriptionsSnapshot = await getDocs(allSubscriptionsQuery);
        console.log('전체 구독 문서 개수:', allSubscriptionsSnapshot.size);
        allSubscriptionsSnapshot.forEach((doc) => {
          console.log('구독 문서:', doc.id, doc.data());
        });
        setSubscriptionInfo(null);
        setSubscriptionStatus('none');
      }
    } catch (error) {
      console.error('구독 정보 가져오기 실패:', error);
      setSubscriptionInfo(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  // 결제 수단 정보 가져오기
  const fetchBillingKeyInfo = async () => {
    let possibleUid = currentUser?.uid;
    
    if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
      const numberWithoutPlus = userProfile.number.replace('+82', '');
      possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
    }
    
    if (!possibleUid) {
      console.log('uid를 찾을 수 없음. 결제 수단 정보를 가져올 수 없습니다.');
      return;
    }
    
    setBillingKeyLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken?.();
      const resp = await fetch(`/api/nicepay/billing-key/${possibleUid}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await resp.json();
      if (!resp.ok || !data?.hasBillingKey) {
        setBillingKeyInfo(null);
        return;
      }
      setBillingKeyInfo({ id: possibleUid, ...data });
    } catch (error) {
      console.error('결제 수단 정보 가져오기 실패:', error);
      setBillingKeyInfo(null);
    } finally {
      setBillingKeyLoading(false);
    }
  };

  // 결제 내역 가져오기
  const fetchPaymentHistory = async () => {
    console.log('결제 내역 가져오기 시작');
    let possibleUid = currentUser?.uid;
    
    if (!possibleUid && (userProfile as any)?.provider && userProfile?.number) {
      const numberWithoutPlus = userProfile.number.replace('+82', '');
      possibleUid = `${(userProfile as any).provider}_${numberWithoutPlus}`;
    }
    
    console.log('사용할 uid:', possibleUid);
    
    if (!possibleUid) {
      console.log('uid를 찾을 수 없음. 결제 내역을 가져올 수 없습니다.');
      return;
    }
    
    setPaymentHistoryLoading(true);
    try {
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('uid', '==', possibleUid),
        orderBy('createdAt', 'desc')
      );
      
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const payments = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('결제 내역 로드됨:', payments);
      setPaymentHistory(payments);
    } catch (error) {
      console.error('결제 내역 가져오기 실패:', error);
      setPaymentHistory([]);
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  // 프로필 로딩 시 폼 초기값 업데이트
  useEffect(() => {
    if (userProfile) {
      profileForm.reset({
        businessName: userProfile.businessName || "",
        businessLink: userProfile.businessLink || "",
        number: userProfile.number || "",
      });
      
      // 구독 정보와 결제 수단 정보 함께 가져오기
      fetchSubscriptionInfo();
      fetchBillingKeyInfo();
    }
  }, [userProfile]);

  let cancelPaymentButton = null;
  if (subscriptionInfo) {
    const latestPaymentDate = subscriptionInfo.lastPaymentDate?.toDate?.() || subscriptionInfo.createdAt?.toDate?.() || new Date();
    const now = new Date();
    const daysSincePayment = Math.floor((now.getTime() - latestPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalUsage = (usageInfo?.keywordAnalysis?.current || 0) + (usageInfo?.productOptimization?.current || 0);
    const canCancel = daysSincePayment <= 7 && totalUsage === 0 && subscriptionInfo.status !== 'EXPIRED';
    
    if (subscriptionInfo.status !== 'EXPIRED') {
      cancelPaymentButton = (
        <div className="mt-4">
          <Button 
            variant="ghost" 
            size="sm"
            className={`text-sm px-0 hover:bg-transparent underline ${
              canCancel 
                ? 'text-muted-foreground' 
                : 'text-gray-400 cursor-not-allowed'
            }`}
            onClick={() => setCancelPaymentOpen(true)}
            disabled={!canCancel}
          >
            결제 취소
          </Button>
          {!canCancel && (
            <p className="text-xs text-gray-500 mt-1">
              결제 취소는 결제일로부터 7일 이내 미사용자 경우에만 가능합니다.
            </p>
          )}
        </div>
      );
    }
  }

  // createdAt 포맷터 (YYYY.MM.DD)
  function formatCreatedAt(input: any): string {
    const toDate = (val: any): Date | null => {
      if (!val) return null;
      if (typeof val?.toDate === 'function') {
        try { return val.toDate(); } catch { /* ignore */ }
      }
      if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      }
      if (val instanceof Date) return val;
      return null;
    };

    const date = toDate(input);
    if (!date) return '정보 없음';

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#f4f4f9'}}>
      <div className="w-full max-w-4xl mx-auto px-4 py-10">
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">내 계정</h1>
            <Button variant="outline" onClick={handleLogout}>로그아웃</Button>
          </div>

          {authError && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}

          {profileLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs defaultValue="profile">
              <TabsList className="mb-6 w-full">
                <TabsTrigger value="profile" className="flex-1">
                  <UserRound className="h-4 w-4 mr-2" /> 내 정보
                </TabsTrigger>
                <TabsTrigger value="danger" className="flex-1">
                  계정 관리
                </TabsTrigger>
              </TabsList>

              {/* 기본 정보 탭 */}
              <TabsContent value="profile">
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>프로필 정보</CardTitle>
                    <CardDescription>
                      스마트스토어 관련 정보와 연락처를 관리합니다.
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {/* Replace the blue info box with readonly fields */}
                    <div className="mb-6 space-y-4">
                      {/* 이름 표시 - 모든 가입자 */}
                      <div>
                        <label className="text-[#555] font-bold text-sm block mb-2">이름</label>
                        <Input value={(userProfile as any)?.name || userProfile?.displayName || ""} readOnly className="bg-gray-50" />
                      </div>

                      {/* 생년월일 표시 */}
                      <div>
                        <label className="text-[#555] font-bold text-sm block mb-2">생년월일</label>
                        <Input 
                          value={
                            userProfile?.birthDate 
                              ? `${userProfile.birthDate.slice(0, 2)}년 ${userProfile.birthDate.slice(2, 4)}월 ${userProfile.birthDate.slice(4, 6)}일`
                              : "-"
                          } 
                          readOnly 
                          className="bg-gray-50" 
                        />
                      </div>

                      {/* 이메일은 항상 표시 */}
                      <div>
                        <label className="text-[#555] font-bold text-sm block mb-2">이메일</label>
                        <Input value={userProfile?.email || ""} readOnly className="bg-gray-50" />
                      </div>

                      {/* 휴대폰 번호 */}
                      <div>
                        <label className="text-[#555] font-bold text-sm block mb-2">휴대폰 번호</label>
                        <Input value={userProfile?.number || ""} readOnly className="bg-gray-50" />
                      </div>

                      {/* End 휴대폰 번호 */}
                      
                      {/* 가입 경로 */}
                      <div>
                        <label className="text-[#555] font-bold text-sm block mb-2">가입 경로</label>
                        <Input 
                          value={
                            provider === "naver" ? "네이버 간편 회원가입" :
                            provider === "kakao" ? "카카오 간편 회원가입" :
                            "이메일 회원가입"
                          }
                          readOnly
                          className={
                            provider === "naver"
                              ? "bg-green-50 border-green-200 text-green-700 font-medium"
                              : provider === "kakao"
                                ? "bg-yellow-50 border-yellow-200 text-yellow-700 font-medium"
                                : "bg-gray-50"
                          }
                        />
                      </div>

                    

                      {/* readonly store info removed per requirement */}
                    </div>

                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                        {!isSocial && (
                        <FormField
                          control={profileForm.control}
                          name="businessName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[#555] font-bold text-sm">스마트스토어 상호</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="상호명을 입력하세요" 
                                  className="border border-[#ccc] rounded-md p-3 font-normal focus:border-[#007BFF]"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        /> )}

                        {!isSocial && (
                        <FormField
                          control={profileForm.control}
                          name="businessLink"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[#555] font-bold text-sm">스마트스토어 홈 링크</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="https://smartstore.naver.com/..." 
                                  className="border border-[#ccc] rounded-md p-3 font-normal focus:border-[#007BFF]"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        /> )}

                        {/* 휴대폰 번호 입력란 제거 (이메일 가입 시 중복 표시 해결) */}

                        <div className="pt-4 flex justify-center">
                          <Button 
                            type="submit" 
                            className="py-2 bg-[#007BFF] hover:bg-[#0056b3] text-white font-bold rounded-md" 
                            disabled={isProfileLoading || !profileForm.formState.isDirty}
                          >
                            {isProfileLoading ? (
                              <>
                                <span className="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 업데이트 중...
                              </>
                            ) : (
                              "정보 저장"
                            )}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 계정 관리 탭 */}
              <TabsContent value="danger">
                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle>계정 관리</CardTitle>
                    <CardDescription>
                      {/* 비밀번호 재설정 및 계정 삭제와 같은 계정 관련 작업을 수행할 수 있습니다. */}
                    </CardDescription>
                  </CardHeader>

                                  <CardContent className="space-y-6">
                  {/* 사용량 조회 섹션 */}
                  <div className="border-b pb-6">
                    <h3 className="text-lg font-medium mb-4 flex items-center">
                      <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                      사용량 조회
                    </h3>
                    {usageLoading ? (
                      <div className="flex justify-center items-center h-20">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : usageInfo ? (
                      <div className="space-y-4">
                        {/* 키워드 분석 사용량 */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <Search className="h-4 w-4 mr-2 text-green-600" />
                              <span className="font-medium">키워드 경쟁률 분석</span>
                            </div>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {usageInfo.keywordAnalysis.current}/{usageInfo.keywordAnalysis.max}
                            </Badge>
                          </div>
                          <Progress 
                            value={(usageInfo.keywordAnalysis.current / usageInfo.keywordAnalysis.max) * 100} 
                            className="h-2"
                          />
                          <p className="text-sm text-gray-600 mt-1">
                            남은 횟수: {usageInfo.keywordAnalysis.remaining}회
                          </p>
                        </div>

                        {/* 상품 최적화 사용량 */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <Sparkles className="h-4 w-4 mr-2 text-blue-600" />
                              <span className="font-medium">상품명 최적화</span>
                            </div>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {usageInfo.productOptimization.current}/{usageInfo.productOptimization.max}
                            </Badge>
                          </div>
                          <Progress 
                            value={(usageInfo.productOptimization.current / usageInfo.productOptimization.max) * 100} 
                            className="h-2"
                          />
                          <p className="text-sm text-gray-600 mt-1">
                            남은 횟수: {usageInfo.productOptimization.remaining}회
                          </p>
                        </div>

                        {/* 히스토리 저장 개수 */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <History className="h-4 w-4 mr-2 text-purple-600" />
                              <span className="font-medium">히스토리 저장</span>
                            </div>
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              {historyCurrent}/{historyMax}
                            </Badge>
                          </div>
                          <Progress 
                            value={(historyCurrent / historyMax) * 100} 
                            className="h-2"
                          />
                          <p className="text-sm text-gray-600 mt-1">
                            남은 개수: {historyMax - historyCurrent}개
                          </p>
                        </div>
                      </div>
                                         ) : (
                       <p className="text-sm text-gray-500">사용량 정보를 불러올 수 없습니다.</p>
                     )}
                     <p className="text-xs text-gray-500 mt-2 text-center">
                       사용량은 매일 새벽에 초기화돼요!
                     </p>
                   </div>

                                     {/* 멤버십 관리와 결제 수단 관리 섹션 - 좌우 배치 */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                     {/* 멤버십 관리 섹션 */}
                     <div className="h-full flex flex-col">
                      <h3 className="text-lg font-medium mb-4 flex items-center">
                        <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
                        멤버십 관리
                      </h3>
                      <div className="space-y-4 flex-1">
                        {subscriptionLoading ? (
                          <div className="flex justify-center items-center h-20">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : subscriptionInfo ? (
                          // 구독 상태에 따른 플랜 표시
                          (() => {
                            // CANCELLED 상태에서 기간이 만료되었는지 확인
                            const isExpired = subscriptionInfo.status === 'EXPIRED';
                            const isCancelled = subscriptionInfo.status === 'CANCELLED';
                            
                                                       if (isExpired) {
                               // EXPIRED 상태: 베이직 플랜 표시 (결제 취소) - 배지와 안내 없이
                               return (
                                 <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                                   <div className="flex items-center justify-between mb-2">
                                     <div>
                                       <h4 className="font-semibold text-gray-800">현재 플랜</h4>
                                       <p className="text-sm text-gray-600">베이직</p>
                                     </div>
                                     <Badge className="bg-blue-100 text-blue-800">베이직</Badge>
                                   </div>
                                   <div className="text-sm text-gray-600 mb-3 space-y-1 flex-1">
                                     <p>• 키워드 분석 5회/일</p>
                                     <p>• 상품 최적화 3회/일</p>
                                     <p>• 최근 내역 3개 저장</p>
                                     <p>• 확장 프로그램 20회/월</p>
                                   </div>
                                   {subscriptionInfo?.paymentFailureReason && (
                                     <div className="text-sm text-gray-600 mb-3">
                                       <p className="text-blue-600 font-medium">결제가 진행되지 않아 베이직으로 변경되었습니다.</p>
                                     </div>
                                   )}
                                   <div className="flex gap-2 mt-auto">
                                     <Button 
                                       variant="outline" 
                                       size="sm"
                                       onClick={() => navigate("/subscription")}
                                     >
                                       플랜 변경
                                     </Button>
                                     <Button 
                                       variant="outline" 
                                       size="sm"
                                       onClick={() => {
                                         setPaymentHistoryOpen(true);
                                         fetchPaymentHistory();
                                       }}
                                     >
                                       결제 내역
                                     </Button>
                                   </div>
                                 </div>
                               );
                             } else if (isCancelled) {
                               // CANCELLED 상태: 기간 만료 여부에 따라 다르게 표시
                               const endDate = subscriptionInfo.endDate?.toDate?.() || new Date();
                               const now = new Date();
                               const isPeriodExpired = now > endDate;
                               
                               if (isPeriodExpired) {
                                 // 기간이 만료된 경우: 베이직 플랜 표시
                                 return (
                                   <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                                     <div className="flex items-center justify-between mb-2">
                                       <div>
                                         <h4 className="font-semibold text-gray-800">현재 플랜</h4>
                                         <p className="text-sm text-gray-600">베이직</p>
                                       </div>
                                       <Badge className="bg-orange-100 text-orange-800">해지됨</Badge>
                                     </div>
                                     <div className="text-sm text-gray-600 mb-3 space-y-1 flex-1">
                                       <p>• 키워드 분석 5회/일</p>
                                       <p>• 상품 최적화 3회/일</p>
                                       <p>• 최근 내역 3개 저장</p>
                                       <p>• 확장 프로그램 20회/월</p>
                                     </div>
                                     <div className="text-sm text-gray-600 mb-3">
                                       <p className="text-orange-600 font-medium">
                                         ⚠️ 멤버십이 해지되어 베이직 플랜으로 변경되었습니다.
                                       </p>
                                     </div>
                                     <div className="flex flex-wrap gap-2 mt-auto">
                                       <Button 
                                         variant="outline" 
                                         size="sm"
                                         onClick={() => navigate("/subscription")}
                                       >
                                         플랜 변경
                                       </Button>
                                       <Button 
                                         variant="outline" 
                                         size="sm"
                                         onClick={() => {
                                           console.log('결제 내역 버튼 클릭됨');
                                           setPaymentHistoryOpen(true);
                                           fetchPaymentHistory();
                                         }}
                                       >
                                         결제 내역
                                       </Button>
                                     </div>
                                   </div>
                                 );
                               } else {
                                 // 기간이 남은 경우: 부스터 플랜 표시 (해지됨)
                                 return (
                                   <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                                     <div className="flex items-center justify-between mb-2">
                                       <div>
                                         <h4 className="font-semibold text-gray-800">현재 플랜</h4>
                                         <p className="text-sm text-gray-600">부스터</p>
                                       </div>
                                       <Badge className="bg-orange-100 text-orange-800">해지됨</Badge>
                                     </div>
                                     <div className="text-sm text-gray-600 mb-3 space-y-1 flex-1">
                                       <p>• 키워드 분석 30회/일</p>
                                       <p>• 상품 최적화 20회/일</p>
                                       <p>• 최근 내역 30개 저장</p>
                                       <p>• 확장 프로그램 무제한 사용</p>
                                       {/* <p>• 신규 기능 우선 이용</p> */}
                                     </div>
                                     <div className="text-sm text-gray-600 mb-3">
                                       <p className="text-orange-600 font-medium">
                                         ⚠️ 멤버십이 해지되었습니다. {subscriptionInfo.endDate?.toDate?.()?.toLocaleDateString()}까지 서비스를 이용하실 수 있습니다.
                                       </p>
                                     </div>
                                     <div className="flex flex-wrap gap-2 mt-auto">
                                       <Button 
                                         variant="outline" 
                                         size="sm"
                                         onClick={() => navigate("/subscription")}
                                       >
                                         플랜 변경
                                       </Button>
                                       <Button 
                                         variant="outline" 
                                         size="sm"
                                         onClick={() => {
                                           setPaymentHistoryOpen(true);
                                           fetchPaymentHistory();
                                         }}
                                       >
                                         결제 내역
                                       </Button>
                                       <Button 
                                         variant="outline" 
                                         size="sm"
                                         className="border-gray-300 text-gray-700 hover:bg-gray-50"
                                         onClick={() => setReactivateMembershipOpen(true)}
                                       >
                                         구독 유지
                                       </Button>
                                     </div>
                                   </div>
                                 );
                               }
                             } else {
                               // ACTIVE 상태: 부스터 플랜 표시 (유료)
                               return (
                                 <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                                   <div className="flex items-center justify-between mb-2">
                                     <div>
                                       <h4 className="font-semibold text-gray-800">현재 플랜</h4>
                                       <p className="text-sm text-gray-600">부스터</p>
                                     </div>
                                     <Badge className="bg-purple-100 text-purple-800">부스터</Badge>
                                   </div>
                                   <div className="text-sm text-gray-600 mb-3 space-y-1 flex-1">
                                     <p>• 키워드 분석 30회/일</p>
                                     <p>• 상품 최적화 20회/일</p>
                                     <p>• 최근 내역 30개 저장</p>
                                     <p>• 확장 프로그램 무제한 사용</p>
                                                                          {/* <p>• 신규 기능 우선 이용</p> */}
                                    </div>
                                    <div className="text-sm text-gray-600 mb-3">
                                      <p>다음 결제일: {subscriptionInfo.endDate?.toDate?.()?.toLocaleDateString() || '정보 없음'}</p>
                                      <p>결제 금액: {subscriptionInfo.lastPaymentAmount ? `${subscriptionInfo.lastPaymentAmount.toLocaleString()}원/월` : '9,900원/월'}</p>
                                      <p>결제 방법: {billingKeyInfo?.cardInfo?.cardName && billingKeyInfo?.cardInfo?.cardNo ? 
                                        `${billingKeyInfo.cardInfo.cardName.replace(/[\[\]]/g, '')} ${billingKeyInfo.cardInfo.cardNo}` : 
                                        billingKeyInfo?.cardInfo?.cardName || '정보 없음'}</p>
                                   </div>
                                   <div className="flex flex-wrap gap-2 mt-auto">
                                     <Button 
                                       variant="outline" 
                                       size="sm"
                                       onClick={() => navigate("/subscription")}
                                     >
                                       플랜 변경
                                     </Button>
                                     <Button 
                                       variant="outline" 
                                       size="sm"
                                       onClick={() => {
                                         setPaymentHistoryOpen(true);
                                         fetchPaymentHistory();
                                       }}
                                     >
                                       결제 내역
                                     </Button>
                                     <Button 
                                       variant="outline" 
                                       size="sm"
                                       className="border-gray-300 text-gray-700 hover:bg-gray-50"
                                       onClick={() => setCancelMembershipOpen(true)}
                                     >
                                       구독 해지
                                     </Button>
                                   </div>
                                 </div>
                               );
                             }
                          })()
                        ) : (
                          // 무료 플랜인 경우
                          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h4 className="font-semibold text-gray-800">현재 플랜</h4>
                                <p className="text-sm text-gray-600">베이직 (무료)</p>
                              </div>
                              <Badge className="bg-blue-100 text-blue-800">무료</Badge>
                            </div>
                                                         <div className="text-sm text-gray-600 mb-3 space-y-1 flex-1">
                               <p>• 키워드 분석 5회/일</p>
                               <p>• 상품 최적화 3회/일</p>
                               <p>• 최근 내역 3개 저장</p>
                               <p>• 확장 프로그램 20회/월</p>
                             </div>
                                                         <div className="flex flex-wrap gap-2 mt-auto">
                               <Button 
                                 variant="outline" 
                                 size="sm"
                                 onClick={() => navigate("/subscription")}
                               >
                                 플랜 변경
                               </Button>
                               <Button 
                                 variant="outline" 
                                 size="sm"
                                 onClick={() => {
                                   setPaymentHistoryOpen(true);
                                   fetchPaymentHistory();
                                 }}
                               >
                                 결제 내역
                               </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={true}
                                className="opacity-50 cursor-not-allowed border-gray-300 text-gray-500"
                                onClick={() => setCancelMembershipOpen(true)}
                              >
                                멤버십 해지
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                                         {/* 결제 수단 관리 섹션 */}
                     <div className="h-full flex flex-col">
                      <h3 className="text-lg font-medium mb-4 flex items-center">
                        <Wallet className="h-5 w-5 mr-2 text-blue-600" />
                        결제 수단 관리
                      </h3>
                      <div className="space-y-4 flex-1">
                        {billingKeyLoading ? (
                          <div className="flex justify-center items-center h-20">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : billingKeyInfo ? (
                                                     // 등록된 결제 수단이 있는 경우
                           <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                             <div className="flex items-center justify-between mb-2">
                               <div>
                                 <h4 className="font-semibold text-gray-800">등록된 결제 수단</h4>
                               </div>
                               <Badge className="bg-blue-100 text-blue-800">등록됨</Badge>
                             </div>
                             <div className="text-sm text-gray-600 mb-3 space-y-1 flex-1">
                               {billingKeyInfo?.cardInfo?.cardName && billingKeyInfo?.cardInfo?.cardNo && (
                                  <p>• 카드: {billingKeyInfo.cardInfo.cardName.replace(/[\[\]]/g, '')} {billingKeyInfo.cardInfo.cardNo}</p>
                                )}
                               {billingKeyInfo.expiry && <p>• 유효기간: {billingKeyInfo.expiry}</p>}
                                                               {typeof billingKeyInfo.createdAt === 'string' && billingKeyInfo.createdAt ? (
                                  <p>• 등록일: {formatCreatedAt(billingKeyInfo.createdAt)}</p>
                                ) : (
                                  <p>• 등록일: 정보 없음</p>
                                )}
                             </div>
                            <p className="text-sm text-gray-600 mb-3">
                              현재 등록된 결제 수단으로 자동 결제됩니다.
                            </p>
                            <p className="text-xs text-gray-500 mb-3">
                              카카오뱅크, 토스뱅크 카드는 매입사인 KB국민, 신한카드로 표기됩니다
                            </p>
                            <div className="flex flex-wrap gap-2 mt-auto">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setBillingKeyChangeOpen(true)}
                              >
                                결제 수단 변경
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className={`${subscriptionInfo?.status === 'ACTIVE' ? 'border-gray-300 text-gray-500 hover:bg-gray-50 opacity-50 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50'}`}
                                onClick={() => setDeleteBillingKeyOpen(true)}
                                disabled={subscriptionInfo?.status === 'ACTIVE'}
                              >
                                결제 수단 삭제
                                {subscriptionInfo?.status === 'ACTIVE' && (
                                  <span className="ml-1 text-xs">(구독 중 삭제 불가)</span>
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // 등록된 결제 수단이 없는 경우
                          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200 h-full flex flex-col">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h4 className="font-semibold text-gray-800">등록된 결제 수단</h4>
                                <p className="text-sm text-gray-600">현재 등록된 결제 수단이 없습니다.</p>
                              </div>
                              <Badge className="bg-gray-100 text-gray-600">없음</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-3 flex-1">
                              결제 수단을 등록하면 멤버십 결제 시 자동으로 결제됩니다.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-auto">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setBillingKeyRegisterOpen(true)}
                              >
                                결제 수단 등록
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={true}
                                className="opacity-50 cursor-not-allowed"
                              >
                                결제 수단 변경
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={true}
                                className="opacity-50 cursor-not-allowed"
                              >
                                결제 수단 삭제
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                 {!isSocial && (
                  <div className="border-b pb-6">
                    <h3 className="text-lg font-medium mb-2">비밀번호 재설정</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      현재 이메일 주소로 비밀번호 재설정 링크를 발송합니다.
                    </p>
                    <Button 
                      variant="outline"
                      onClick={async () => {
                        try {
                          if (userProfile?.email) {
                            const success = await sendPasswordReset(userProfile.email);
                            if (success) {
                              toast({
                                title: "비밀번호 재설정 이메일 발송",
                                description: "이메일함을 확인하여 비밀번호를 재설정해주세요.",
                              });
                            }
                          }
                        } catch (error) {
                          toast({
                            title: "오류 발생",
                            description: "비밀번호 재설정 이메일 발송 중 문제가 발생했습니다.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      비밀번호 재설정 이메일 받기
                    </Button>
                  </div>
                 )}

                    {/* 계정 삭제 - Collapsible 로 감추기 */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="text-sm text-muted-foreground px-0 hover:bg-transparent underline">
                          추가 설정
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-4">
                          <p className="text-sm text-muted-foreground mb-4">
                            {/* 탈퇴하면 모든 정보가 영구적으로 제거됩니다. 이 작업은 되돌릴 수 없습니다. */}
                            <span className="font-bold text-black">계정을 삭제하신 후에는 30일 간 재가입이 제한됩니다</span>
                          </p>
                                                                  <Button
                      variant="ghost"
                      className="text-sm text-muted-foreground px-0 hover:bg-transparent underline"
                      onClick={() => setDeleteWarnOpen(true)}
                      disabled={subscriptionStatus === 'active' || subscriptionStatus === 'cancelled'}
                    >
                      {subscriptionStatus === 'active' ? '탈퇴 불가' :
                       subscriptionStatus === 'cancelled' ? '구독 만료 이후 탈퇴 가능' :
                       '계정 탈퇴'}
                    </Button>
                    
                    {/* 구독 상태 안내 */}
                    {subscriptionStatus === 'active' && (
                      <p className="text-xs text-red-500 mt-1">
                       구독을 해지한 후 탈퇴해주세요. 구독 만료 이후 탈퇴 가능합니다.
                      </p>
                    )}
                    {/* 결제 취소 버튼 조건부 노출 */}
                    {cancelPaymentButton}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* 30일 재가입 제한 경고 다이얼로그 */}
                    <Dialog open={deleteWarnOpen} onOpenChange={setDeleteWarnOpen}>
                      <DialogContent className="border-none shadow-md">
                        <DialogHeader>
                          <DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
                          <DialogDescription>
                            계정을 삭제하면 모든 데이터가 영구적으로 삭제되고,
                            같은 이메일 또는 휴대폰 번호로 1개월(30일) 동안 재가입이 불가능합니다.
                            그래도 탈퇴를 진행하시겠습니까?
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                          <Button variant="outline" type="button" onClick={() => setDeleteWarnOpen(false)}>
                            취소
                          </Button>
                          <Button variant="destructive" className="bg-red-500 hover:bg-red-600" type="button" onClick={() => {
                            setDeleteWarnOpen(false);
                            setDeleteDialogOpen(true);
                          }}>
                            계속 진행
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 삭제 확인 다이얼로그 */}
                    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                      <DialogContent className="border-none shadow-md">
                        <DialogHeader>
                          <DialogTitle>계정 탈퇴 확인</DialogTitle>
                          <DialogDescription>
                            계정을 탈퇴하시면 모든 데이터가 영구적으로 삭제되며, 이 작업은 되돌릴 수 없습니다.
                          </DialogDescription>
                        </DialogHeader>

                        <Form {...deleteAccountForm}>
                          <form onSubmit={deleteAccountForm.handleSubmit(onDeleteSubmit)} className="space-y-4">

                            <FormField
                              control={deleteAccountForm.control}
                              name="reason"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-[#555] font-bold text-sm">탈퇴 사유</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="탈퇴 사유를 입력해주세요 (10자 이상)"
                                      className="border border-[#ccc] rounded-md p-3 font-normal focus:border-[#007BFF]"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <DialogFooter className="gap-2 sm:gap-0">
                              <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setDeleteDialogOpen(false)}
                              >
                                취소
                              </Button>
                              <Button 
                                type="submit" 
                                variant="destructive"
                                className="bg-red-500 hover:bg-red-600"
                                disabled={isDeleteLoading}
                              >
                                {isDeleteLoading ? (
                                  <>
                                    <span className="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 처리 중...
                                  </>
                                ) : (
                                  "계정 탈퇴"
                                )}
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>

                    {/* 멤버십 해지 확인 다이얼로그 */}
                    <Dialog open={cancelMembershipOpen} onOpenChange={(open)=>{ setCancelMembershipOpen(open); if(!open) setCancelMembershipReason(""); }}>
                      <DialogContent className="border-none shadow-md">
                        <DialogHeader>
                          <DialogTitle>멤버십 해지 확인</DialogTitle>
                          <DialogDescription>
                            멤버십을 해지하시면 다음 정기 결제일부터 자동 결제가 중단됩니다. 
                             해지 후에도 현재 결제 주기가 끝나는 날까지는 서비스를 이용하실 수 있습니다.
                             <br/><br/>
                             <span className="font-medium text-red-600">
                               다음 결제일: {subscriptionInfo?.endDate?.toDate?.()?.toLocaleDateString() || '정보 없음'}
                             </span>
                           </DialogDescription>
                         </DialogHeader>
                         <div className="space-y-2 mt-2">
                           <label className="text-sm font-medium text-gray-700">해지 사유 (10자 이상)</label>
                           <Textarea
                             value={cancelMembershipReason}
                             onChange={(e) => setCancelMembershipReason(e.target.value)}
                             placeholder="해지 사유를 입력해주세요 (10자 이상)"
                             className="min-h-[100px]"
                           />
                           <div className="text-xs text-gray-500 text-right">{cancelMembershipReason.trim().length} / 10</div>
                         </div>
                         <DialogFooter className="gap-2 sm:gap-0">
                           <Button 
                             type="button" 
                             variant="outline" 
                             onClick={() => setCancelMembershipOpen(false)}
                           >
                             취소
                           </Button>
                           <Button 
                             type="button" 
                             variant="destructive"
                             className="bg-red-500 hover:bg-red-600"
                             disabled={isCancellingMembership || cancelMembershipReason.trim().length < 10}
                             onClick={handleCancelMembership}
                           >
                             {isCancellingMembership ? (
                               <>
                                 <span className="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 처리 중...
                               </>
                             ) : (
                               "멤버십 해지"
                             )}
                           </Button>
                         </DialogFooter>
                       </DialogContent>
                     </Dialog>

                                         {/* 멤버십 재활성화 확인 다이얼로그 */}
                     <Dialog open={reactivateMembershipOpen} onOpenChange={setReactivateMembershipOpen}>
                       <DialogContent className="border-none shadow-md">
                         <DialogHeader>
                           <DialogTitle>멤버십 재활성화 확인</DialogTitle>
                           <DialogDescription>
                             멤버십을 재활성화하시면 정기 결제가 다시 시작됩니다. 
                             현재 결제 주기가 끝나는 날부터 다음 결제가 진행됩니다.
                             <br/><br/>
                             <span className="font-medium text-green-600">
                               다음 결제일: {subscriptionInfo?.endDate?.toDate?.()?.toLocaleDateString() || '정보 없음'}
                             </span>
                           </DialogDescription>
                         </DialogHeader>
                         <DialogFooter className="gap-2 sm:gap-0">
                           <Button 
                             type="button" 
                             variant="outline" 
                             onClick={() => setReactivateMembershipOpen(false)}
                           >
                             취소
                           </Button>
                           <Button 
                             type="button" 
                             variant="default"
                             className="bg-green-500 hover:bg-green-600"
                             disabled={isReactivatingMembership}
                             onClick={handleReactivateMembership}
                           >
                             {isReactivatingMembership ? (
                               <>
                                 <span className="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 처리 중...
                               </>
                             ) : (
                               "멤버십 유지"
                             )}
                           </Button>
                         </DialogFooter>
                       </DialogContent>
                     </Dialog>

                     {/* 결제수단 삭제 확인 다이얼로그 */}
                     <Dialog open={deleteBillingKeyOpen} onOpenChange={setDeleteBillingKeyOpen}>
                       <DialogContent className="border-none shadow-md">
                         <DialogHeader>
                           <DialogTitle>결제수단 삭제 확인</DialogTitle>
                           <DialogDescription>
                             등록된 결제수단을 삭제하시겠습니까?
                             <br/><br/>
                             <span className="font-medium text-red-600">
                               ⚠️ 주의: 활성 구독이 있는 경우 결제수단을 삭제할 수 없습니다.
                             </span>
                             <br/><br/>
                             삭제 후에는 새로운 결제수단을 등록해야 멤버십 결제가 가능합니다.
                           </DialogDescription>
                         </DialogHeader>
                         <DialogFooter className="gap-2 sm:gap-0">
                           <Button 
                             type="button" 
                             variant="outline" 
                             onClick={() => setDeleteBillingKeyOpen(false)}
                           >
                             취소
                           </Button>
                           <Button 
                             type="button" 
                             variant="destructive"
                             className="bg-red-500 hover:bg-red-600"
                             disabled={isDeletingBillingKey}
                             onClick={handleDeleteBillingKey}
                           >
                             {isDeletingBillingKey ? (
                               <>
                                 <span className="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 처리 중...
                               </>
                             ) : (
                               "결제수단 삭제"
                             )}
                           </Button>
                         </DialogFooter>
                       </DialogContent>
                     </Dialog>

                     {/* 결제 취소 확인 다이얼로그 */}
                     <Dialog open={cancelPaymentOpen} onOpenChange={(open)=>{ setCancelPaymentOpen(open); if(!open) setCancelReason(""); }}>
                       <DialogContent className="border-none shadow-md">
                         <DialogHeader>
                           <DialogTitle>결제 취소 확인</DialogTitle>
                           <DialogDescription>
                             결제를 취소하시겠습니까?
                             <br/><br/>
                             <span className="font-medium text-red-600">
                               ⚠️ 결제 취소 시 전체 금액이 환불되며, 즉시 베이직 플랜으로 변경됩니다.
                             </span>
                             <br/><br/>
                             <span className="text-sm text-gray-600 block">
                               결제일로부터 7일 이내 미사용일 경우에만 환불이 가능합니다. 환불은 영업일 기준 1-2일 내에 처리됩니다
                             </span>
                           </DialogDescription>
                         </DialogHeader>
                         <div className="space-y-2 mt-2">
                           <label className="text-sm font-medium text-gray-700">취소 사유 (10자 이상)</label>
                           <Textarea
                             value={cancelReason}
                             onChange={(e) => setCancelReason(e.target.value)}
                                                           placeholder="취소 사유를 입력해주세요 (10자 이상)"
                             className="min-h-[100px]"
                           />
                                                       <div className="text-xs text-gray-500 text-right">{cancelReason.trim().length} / 10</div>
                         </div>
                         <DialogFooter className="gap-2 sm:gap-0">
                           <Button 
                             type="button" 
                             variant="outline" 
                             onClick={() => setCancelPaymentOpen(false)}
                           >
                             취소
                           </Button>
                           <Button 
                             type="button" 
                             variant="destructive"
                             className="bg-red-500 hover:bg-red-600"
                                                           disabled={isCancellingPayment || cancelReason.trim().length < 10}
                             onClick={handleCancelPayment}
                           >
                             {isCancellingPayment ? (
                               <>
                                 <span className="inline-block w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 처리 중...
                               </>
                             ) : (
                               "결제 취소"
                             )}
                           </Button>
                         </DialogFooter>
                       </DialogContent>
                     </Dialog>

                     {/* 결제 수단 변경 다이얼로그 */}
                     <Dialog open={billingKeyChangeOpen} onOpenChange={setBillingKeyChangeOpen}>
                       <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-none shadow-none bg-transparent">
                         <DialogHeader>
                           <DialogTitle>결제 수단 변경</DialogTitle>
                           <DialogDescription>
                             새로운 카드로 결제 수단을 변경합니다.
                           </DialogDescription>
                         </DialogHeader>
                         <BillingKeyForm 
                           isChangeMode={true}
                           onSuccess={() => {
                             setBillingKeyChangeOpen(false);
                             fetchBillingKeyInfo(); // 빌키 정보 새로고침
                             toast({
                               title: "결제 수단 변경 완료",
                               description: "새로운 카드로 결제 수단이 변경되었습니다.",
                             });
                           }}
                           onCancel={() => setBillingKeyChangeOpen(false)}
                         />
                       </DialogContent>
                     </Dialog>

                     {/* 결제 수단 등록 다이얼로그 */}
                     <Dialog open={billingKeyRegisterOpen} onOpenChange={setBillingKeyRegisterOpen}>
                       <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-none shadow-none bg-transparent">
                         <DialogHeader>
                           <DialogTitle>결제 수단 등록</DialogTitle>
                           <DialogDescription>
                             새로운 카드를 등록하여 자동 결제를 설정합니다.
                           </DialogDescription>
                         </DialogHeader>
                         <BillingKeyForm 
                           isChangeMode={false}
                           onSuccess={() => {
                             setBillingKeyRegisterOpen(false);
                             fetchBillingKeyInfo(); // 빌키 정보 새로고침
                             toast({
                               title: "결제 수단 등록 완료",
                               description: "카드가 성공적으로 등록되었습니다.",
                             });
                           }}
                           onCancel={() => setBillingKeyRegisterOpen(false)}
                         />
                       </DialogContent>
                     </Dialog>

                     {/* 결제 내역 다이얼로그 */}
                     <Dialog open={paymentHistoryOpen} onOpenChange={setPaymentHistoryOpen}>
                       <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                         <DialogHeader>
                           <DialogTitle>결제 내역</DialogTitle>
                           <DialogDescription>
                             모든 결제 내역을 확인할 수 있습니다.
                           </DialogDescription>
                         </DialogHeader>
                         <div className="py-4">
                           {paymentHistoryLoading ? (
                             <div className="flex justify-center items-center h-32">
                               <Loader2 className="h-8 w-8 animate-spin text-primary" />
                             </div>
                           ) : paymentHistory.length > 0 ? (
                             <div className="space-y-4">
                               {paymentHistory.map((payment) => (
                                 <div key={payment.id} className="border rounded-lg p-4 bg-gray-50">
                                   <div className="flex justify-between items-start mb-3">
                                     <div>
                                       <h4 className="font-semibold text-gray-800">{payment.goodsName}</h4>
                                       <p className="text-sm text-gray-600">주문번호: {payment.orderId}</p>
                                     </div>
                                     <div className="text-right">
                                       <p className="text-lg font-bold text-blue-600 whitespace-nowrap">
                                         {payment.amount?.toLocaleString()}원
                                       </p>
                                       <Badge 
                                         className={`${
                                           payment.status === 'SUCCESS' ? 'bg-blue-100 text-blue-800' :
                                           payment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                           payment.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                                           payment.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                           'bg-gray-100 text-gray-800'
                                         }`}
                                       >
                                         {payment.status === 'SUCCESS' ? '결제' :
                                          payment.status === 'COMPLETED' ? '완료' :
                                          payment.status === 'CANCELLED' ? '취소' :
                                          payment.status === 'FAILED' ? '실패' :
                                          payment.status}
                                       </Badge>
                                     </div>
                                   </div>
                                   <div className="space-y-2 text-sm text-gray-600">
                                     {payment.cancelReason && (
                                       <p><strong>취소사유:</strong> {payment.cancelReason}</p>
                                     )}
                                     <p><strong>결제일:</strong> {payment.createdAt?.toDate?.()?.toLocaleString() || '정보 없음'}</p>
                                     {payment.cancelledAt && (
                                       <p><strong>취소일:</strong> {payment.cancelledAt.toDate?.()?.toLocaleString()}</p>
                                     )}
                                   </div>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <div className="text-center py-8">
                               <p className="text-gray-500">결제 내역이 없습니다.</p>
                             </div>
                           )}
                         </div>
                       </DialogContent>
                     </Dialog>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}