import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { UserProfile } from "@/types";
import { db, auth } from "@/lib/firebase"; // db는 initializeApp 후에 만든 Firestore 인스턴스
import { collection, addDoc, serverTimestamp, setDoc, doc } from "firebase/firestore";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserRound } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle
} from "@/components/ui/dialog";

// 프로필 업데이트 스키마
const profileSchema = z.object({
  businessName: z.string().min(1, "스마트스토어 상호명을 입력해주세요"),
  businessLink: z.string().url("올바른 URL 형식을 입력해주세요"),
  number: z.string().min(1, "휴대폰 번호를 입력해주세요"),
});

// 회원탈퇴 스키마
const deleteAccountSchema = z.object({
  password: z.string().min(1, "비밀번호를 입력해주세요"),
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
    sendPasswordReset // Added sendPasswordReset function
  } = useAuth();

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const provider = (userProfile as any)?.provider;
  const isSocial = provider === "naver" || provider === "kakao";
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

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
      password: "",
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

       // 1. 탈퇴 사유 저장
       await setDoc(doc(db, "accountDeletions", userProfile?.uid ?? Math.random().toString(36).substr(2, 9)), {
        reason: data.reason,
        email: userProfile?.email,
        link: userProfile?.businessLink,
        name: userProfile?.businessName,
        timestamp: new Date(),
      });
      
    
      const success = await deleteUserAccount(data.password);
      if (success) {
        toast({
          title: "회원 탈퇴 완료",
          description: "계정이 성공적으로 삭제되었습니다.",
        });
        setDeleteDialogOpen(false);
        navigate("/");
      } else {
        // success가 false인 경우도 처리
        toast({
          title: "회원 탈퇴 실패",
          description: "계정 삭제에 실패했습니다. 다시 시도해주세요.",
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

  // 프로필 로딩 시 폼 초기값 업데이트
  useEffect(() => {
    if (userProfile) {
      profileForm.reset({
        businessName: userProfile.businessName || "",
        businessLink: userProfile.businessLink || "",
        number: userProfile.number || "",
      });
    }
  }, [userProfile]);

  return (
    <div className="container py-10" style={{backgroundColor: '#f4f4f9'}}>
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-sm">
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
                    {/* Determine which fields to show */}
                    {provider === "naver" || provider === "kakao" ? (
                      // 소셜 로그인: 이름 포함
                      <>
                        <div>
                          <label className="text-[#555] font-bold text-sm block mb-2">이름</label>
                          <Input value={(userProfile as any)?.name || userProfile?.displayName || ""} readOnly className="bg-gray-50" />
                        </div>
                      </>
                    ) : null}

                    {/* 이메일은 항상 표시 */}
                    <div>
                      <label className="text-[#555] font-bold text-sm block mb-2">이메일</label>
                      <Input value={userProfile?.email || ""} readOnly className="bg-gray-50" />
                    </div>

                    {/* 휴대폰 */}
                    <div>
                      <label className="text-[#555] font-bold text-sm block mb-2">휴대폰</label>
                      <Input value={userProfile?.number || (auth.currentUser?.phoneNumber ?? "")} readOnly className="bg-gray-50" />
                    </div>

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

                      {!isSocial && (
                      <FormField
                        control={profileForm.control}
                        name="number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#555] font-bold text-sm">휴대폰 번호</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="연락 가능한 번호를 입력하세요" 
                                className="border border-[#ccc] rounded-md p-3 font-normal focus:border-[#007BFF]"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />)}

                      <div className="pt-4">
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
                    비밀번호 재설정 및 계정 삭제와 같은 계정 관련 작업을 수행할 수 있습니다.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
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

                  <div>
                    <h3 className="text-lg font-medium text-red-600 mb-2">계정 삭제</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      계정을 삭제하면 모든 정보가 영구적으로 제거됩니다. 이 작업은 되돌릴 수 없습니다.
                    </p>
                    <div className="pt-4">
                      <Button 
                        variant="destructive" 
                        className="bg-red-500 hover:bg-red-600"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        계정 삭제
                      </Button>
                    </div>

                    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                      <DialogContent className="border-none shadow-md">
                        <DialogHeader>
                          <DialogTitle>계정 삭제 확인</DialogTitle>
                          <DialogDescription>
                            계정을 삭제하시면 모든 데이터가 영구적으로 삭제되며, 이 작업은 되돌릴 수 없습니다.
                          </DialogDescription>
                        </DialogHeader>

                        <Form {...deleteAccountForm}>
                          <form onSubmit={deleteAccountForm.handleSubmit(onDeleteSubmit)} className="space-y-4">
                            <FormField
                              control={deleteAccountForm.control}
                              name="password"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-[#555] font-bold text-sm">비밀번호</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="password" 
                                      placeholder="보안을 위해 현재 비밀번호를 입력하세요" 
                                      className="border border-[#ccc] rounded-md p-3 font-normal focus:border-[#007BFF]"
                                      {...field} 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

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
                                  "계정 삭제"
                                )}
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}