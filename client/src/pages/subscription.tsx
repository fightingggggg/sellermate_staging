import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CreditCard, Calendar, User, Building, UserCheck, CheckSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";

export default function SubscriptionPage() {
  const { currentUser } = useAuth();
  const [, navigate] = useLocation();
  
  const [formData, setFormData] = useState({
    cardNumber: "",
    expiryDate: "",
    birthDate: "",
    businessNumber: "",
    passwordPrefix: ""
  });
  
  const [cardType, setCardType] = useState<"personal" | "business">("personal");
  const [agreeToSubscription, setAgreeToSubscription] = useState(false);
  
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // 에러 메시지 초기화
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleCardTypeChange = (type: "personal" | "business") => {
    setCardType(type);
    // 카드 타입 변경 시 관련 필드 초기화
    if (type === "personal") {
      setFormData(prev => ({ ...prev, businessNumber: "" }));
      setErrors(prev => ({ ...prev, businessNumber: "" }));
    } else {
      setFormData(prev => ({ ...prev, birthDate: "" }));
      setErrors(prev => ({ ...prev, birthDate: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    // 신용카드 번호 검증 (16자리 숫자)
    if (!formData.cardNumber.replace(/\s/g, "").match(/^\d{16}$/)) {
      newErrors.cardNumber = "16자리 신용카드 번호를 입력해주세요";
    }

    // 유효기간 검증 (MM/YY 형식)
    if (!formData.expiryDate.match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)) {
      newErrors.expiryDate = "MM/YY 형식으로 입력해주세요 (예: 12/25)";
    }

    // 카드 타입에 따른 검증
    if (cardType === "personal") {
      // 개인카드: 생년월일 6자리 검증 (YYMMDD)
      if (!formData.birthDate.match(/^\d{6}$/)) {
        newErrors.birthDate = "생년월일 6자리를 입력해주세요 (예: 900101)";
      }
    } else {
      // 법인카드: 사업자등록번호 10자리 검증
      if (!formData.businessNumber.match(/^\d{10}$/)) {
        newErrors.businessNumber = "10자리 사업자등록번호를 입력해주세요";
      }
    }

    // 비밀번호 앞 2자리 검증
    if (!formData.passwordPrefix.match(/^\d{2}$/)) {
      newErrors.passwordPrefix = "비밀번호 앞 2자리를 입력해주세요";
    }

    // 정기 결제 동의 검증
    if (!agreeToSubscription) {
      newErrors.agreement = "정기 결제 동의가 필요합니다";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      const idToken = await auth.currentUser?.getIdToken();

      const resp = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          cardNumber: formData.cardNumber.replace(/\s+/g, ""),
          expiryDate: formData.expiryDate,
          birthDate: cardType === "personal" ? formData.birthDate : undefined,
          businessNumber: cardType === "business" ? formData.businessNumber : undefined,
          passwordPrefix: formData.passwordPrefix,
          amount: 100,
          goodsName: "스토어부스터 부스터 플랜",
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json.message || json.error || "결제 실패");
      }

      // 성공 처리 – 이후 페이지 이동 또는 알림
      alert("구독이 완료되었습니다! 결제 TID: " + json.tid);
      navigate("/membership");
    } catch (err: any) {
      setErrors({ submit: err?.message || "결제 중 오류가 발생했습니다" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || "";
    const parts = [];
    
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    
    if (parts.length) {
      return parts.join(" ");
    } else {
      return v;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (v.length >= 2) {
      return v.substring(0, 2) + "/" + v.substring(2, 4);
    }
    return v;
  };

  if (!currentUser) {
    navigate("/membership");
    return null;
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            부스터 구독하기
          </h1>
          <p className="text-lg text-gray-600">
            월 14,900원으로 더 많은 기능을 이용해보세요
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="bg-blue-50 border-b border-blue-100">
            <CardTitle className="text-xl font-bold text-blue-600 flex items-center">
              <CreditCard className="w-5 h-5 mr-2" />
              결제 정보 입력
            </CardTitle>
            <CardDescription>
              안전한 결제를 위해 필요한 정보를 입력해주세요
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
                             {/* 신용카드 번호 */}
               <div className="space-y-2">
                 <Label htmlFor="cardNumber" className="flex items-center">
                   <CreditCard className="w-4 h-4 mr-2" />
                   신용카드 번호 <span className="text-red-500 ml-1">*</span>
                 </Label>
                <Input
                  id="cardNumber"
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  value={formData.cardNumber}
                  onChange={(e) => handleInputChange("cardNumber", formatCardNumber(e.target.value))}
                  maxLength={19}
                  className={errors.cardNumber ? "border-red-500" : ""}
                />
                {errors.cardNumber && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.cardNumber}</AlertDescription>
                  </Alert>
                )}
              </div>

                             {/* 유효기간 */}
               <div className="space-y-2">
                 <Label htmlFor="expiryDate" className="flex items-center">
                   <Calendar className="w-4 h-4 mr-2" />
                   유효기간 <span className="text-red-500 ml-1">*</span>
                 </Label>
                <Input
                  id="expiryDate"
                  type="text"
                  placeholder="MM/YY"
                  value={formData.expiryDate}
                  onChange={(e) => handleInputChange("expiryDate", formatExpiryDate(e.target.value))}
                  maxLength={5}
                  className={errors.expiryDate ? "border-red-500" : ""}
                />
                {errors.expiryDate && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.expiryDate}</AlertDescription>
                  </Alert>
                )}
              </div>

                             {/* 카드 타입 선택 */}
               <div className="space-y-2">
                 <Label className="flex items-center">
                   <UserCheck className="w-4 h-4 mr-2" />
                   카드 종류 <span className="text-red-500 ml-1">*</span>
                 </Label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cardType"
                      value="personal"
                      checked={cardType === "personal"}
                      onChange={(e) => handleCardTypeChange(e.target.value as "personal" | "business")}
                      className="text-blue-600"
                    />
                    <span className="text-sm">개인카드</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cardType"
                      value="business"
                      checked={cardType === "business"}
                      onChange={(e) => handleCardTypeChange(e.target.value as "personal" | "business")}
                      className="text-blue-600"
                    />
                    <span className="text-sm">법인카드</span>
                  </label>
                </div>
              </div>

                             {/* 생년월일 (개인카드) */}
               {cardType === "personal" && (
                 <div className="space-y-2">
                   <Label htmlFor="birthDate" className="flex items-center">
                     <User className="w-4 h-4 mr-2" />
                     생년월일 <span className="text-red-500 ml-1">*</span>
                   </Label>
                  <Input
                    id="birthDate"
                    type="text"
                    placeholder="900101"
                    value={formData.birthDate}
                    onChange={(e) => handleInputChange("birthDate", e.target.value.replace(/\D/g, ""))}
                    maxLength={6}
                    className={errors.birthDate ? "border-red-500" : ""}
                  />
                  <p className="text-xs text-gray-500">생년월일 6자리를 입력해주세요 (예: 900101)</p>
                  {errors.birthDate && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errors.birthDate}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

                             {/* 사업자등록번호 (법인카드) */}
               {cardType === "business" && (
                 <div className="space-y-2">
                   <Label htmlFor="businessNumber" className="flex items-center">
                     <Building className="w-4 h-4 mr-2" />
                     사업자등록번호 <span className="text-red-500 ml-1">*</span>
                   </Label>
                  <Input
                    id="businessNumber"
                    type="text"
                    placeholder="1234567890"
                    value={formData.businessNumber}
                    onChange={(e) => handleInputChange("businessNumber", e.target.value.replace(/\D/g, ""))}
                    maxLength={10}
                    className={errors.businessNumber ? "border-red-500" : ""}
                  />
                  <p className="text-xs text-gray-500">10자리 사업자등록번호를 입력해주세요</p>
                  {errors.businessNumber && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{errors.businessNumber}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

                             {/* 비밀번호 앞 2자리 */}
               <div className="space-y-2">
                 <Label htmlFor="passwordPrefix" className="flex items-center">
                   <CreditCard className="w-4 h-4 mr-2" />
                   비밀번호 앞 2자리 <span className="text-red-500 ml-1">*</span>
                 </Label>
                                 <Input
                   id="passwordPrefix"
                   type="password"
                   value={formData.passwordPrefix}
                   onChange={(e) => handleInputChange("passwordPrefix", e.target.value.replace(/\D/g, ""))}
                   maxLength={2}
                   className={errors.passwordPrefix ? "border-red-500" : ""}
                 />
                {errors.passwordPrefix && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errors.passwordPrefix}</AlertDescription>
                  </Alert>
                )}
              </div>

                             {/* 정기 결제 동의 */}
               <div className="space-y-2">
                 <div className="flex items-start space-x-2">
                   <input
                     type="checkbox"
                     id="agreeToSubscription"
                     checked={agreeToSubscription}
                     onChange={(e) => setAgreeToSubscription(e.target.checked)}
                     className="mt-1 text-blue-600"
                   />
                   <label htmlFor="agreeToSubscription" className="text-sm text-gray-700 leading-relaxed">
                     구독 상품과 설명을 확인하였으며, 30일 간격으로 정기 결제에 동의합니다.
                   </label>
                 </div>
                 {errors.agreement && (
                   <Alert variant="destructive" className="py-2">
                     <AlertCircle className="h-4 w-4" />
                     <AlertDescription>{errors.agreement}</AlertDescription>
                   </Alert>
                 )}
               </div>

               {/* 전체 제출 에러 */}
               {errors.submit && (
                 <Alert variant="destructive">
                   <AlertCircle className="h-4 w-4" />
                   <AlertDescription>{errors.submit}</AlertDescription>
                 </Alert>
               )}

                              {/* 구독 버튼 */}
               <div className="pt-4">
                 <Button
                   type="submit"
                   className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg font-semibold"
                   disabled={isSubmitting}
                 >
                   {isSubmitting ? "처리 중..." : "월 100원으로 구독하기"}
                 </Button>
                </div>

              {/* 취소 버튼 */}
              <div className="text-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/membership")}
                  className="text-gray-600"
                >
                  취소
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 보안 안내 */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            {/* 모든 결제 정보는 안전하게 암호화되어 처리됩니다. */}
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
} 