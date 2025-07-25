import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FeedbackDialog } from "./ui/feedback-dialog";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { LogOut, Menu, User } from "lucide-react";
import { UsageDisplay } from "./UsageDisplay";
import { trackEvent } from "@/lib/analytics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "wouter";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

// GA 이벤트 제거 – Dashboard 전용

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { currentUser, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Dashboard 관련 GA 이벤트 모두 제거

  // 네비게이션 링크의 활성/비활성 상태에 따라 스타일을 다르게 지정하는 헬퍼
  const navLinkClass = (isActive: boolean) =>
    `px-3 py-2 text-sm font-medium ${isActive ? "text-gray-700" : "text-gray-400"} hover:text-blue-700`;

  // 빠른 상품명 최적화 이동 시 진행 중인 워크플로우 확인
  const handleQuickNavigate = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    const onCompletePage = location.startsWith("/product-optimizer/complete");
    const hasData = !!localStorage.getItem("latestKeywordAnalysis");
    if (onCompletePage && hasData) {
      e.preventDefault();
      const ok = window.confirm("현재 작업 중인 상품명 최적화가 있습니다. 빠른 상품명 최적화로 이동하시겠어요?");
      if (ok) {
        try {
          sessionStorage.setItem("allowPrefill", "1");
        } catch {}
        navigate("/product-optimizer/quick");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link href="/" className="flex items-center">
                  <img src="/logo.png" alt="스토어부스터" style={{ height: '1.5em', margin: 0, display: 'inline-block', verticalAlign: 'top', marginTop: '-0.3em' }} />
                </Link>
              </div>

              <div className="hidden sm:ml-6 sm:flex sm:items-center">
                {/* 홈 및 확장프로그램 설치 메뉴 제거 */}
                <Link
                  href="/keyword-competition-analysis"
                  className={navLinkClass(location.startsWith("/keyword-competition-analysis"))}
                  onClick={() => trackEvent('Navigation', 'menu_keyword_analysis')}
                >
                  키워드 경쟁률 분석
                </Link>
                
                <Link
                  href="/product-optimizer/complete"
                  className={navLinkClass(location.startsWith("/product-optimizer"))}
                  onClick={() => trackEvent('Navigation', 'menu_product_optimizer')}
                >
                  상품명 최적화
                </Link>
                
                <button 
                  onClick={() => {
                    trackEvent('Navigation', 'menu_feedback');
                    setIsFeedbackOpen(true);
                  }}
                  className={navLinkClass(false)}
                >
                  문의 및 피드백
                </button>
                  <button
                  onClick={() => {
                    trackEvent('Navigation', 'menu_usage_guide');
                    window.open("https://chambray-midnight-e7f.notion.site/22b78708053f80579570e27e27559b31?source=copy_link", "_blank");
                  }}
                  className={navLinkClass(false)}
                >
                  사용법
                </button>
              </div>
            </div>

            <div className="flex items-center">
              {currentUser ? (
                <>
                  {/* 멤버십 버튼: PC에서만 보이게, 모바일(상단바)에서는 숨김 (로그인/비로그인 모두) */}
                  <Link
                    href="/membership"
                    className={
                      `px-3 py-2 text-sm font-medium transition-colors duration-150 hidden sm:inline ` +
                      (location.startsWith("/membership")
                        ? "text-blue-700 font-bold"
                        : "text-blue-600 hover:text-blue-700 active:text-blue-800 font-bold hover:font-extrabold")
                    }
                    style={{ minWidth: 80, textAlign: 'center', background: 'none' }}
                    onClick={() => trackEvent('Navigation', 'menu_membership')}
                  >
                    멤버십
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="cursor-pointer">
                      <div className="flex items-center">
                        <Avatar className="h-8 w-8 border border-slate-200">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                            {currentUser.email?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <UsageDisplay />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                      <DropdownMenuLabel>내 계정</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      <DropdownMenuItem onClick={() => {
                        trackEvent('Navigation', 'menu_profile');
                        navigate("/profile");
                      }} className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>내 프로필</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                         trackEvent('Navigation', 'menu_logout');
                         handleLogout();
                      }} className="cursor-pointer text-red-600 focus:text-red-600">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>로그아웃</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <div className="flex items-center space-x-3">
                  {/* 멤버십 버튼: PC에서만 보이게, 모바일(상단바)에서는 숨김 (로그인/비로그인 모두) */}
                  <Link
                    href="/membership"
                    className={
                      `px-3 py-2 text-sm font-medium transition-colors duration-150 hidden sm:inline ` +
                      (location.startsWith("/membership")
                        ? "text-blue-700 font-bold"
                        : "text-blue-600 hover:text-blue-700 active:text-blue-800 font-bold hover:font-extrabold")
                    }
                    style={{ minWidth: 80, textAlign: 'center', background: 'none' }}
                    onClick={() => trackEvent('Navigation', 'menu_membership')}
                  >
                    멤버십
                  </Link>

                  {/* 모바일(PC에서는 숨김)에서만 보이는 빠른 상품명 최적화 버튼 */}
                  <Button
                    onClick={() => {
                      trackEvent('Navigation', 'mobile_quick_optimizer');
                      navigate('/product-optimizer/quick');
                    }}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 sm:hidden"
                  >
                    빠른 상품명 최적화
                  </Button>

                  {/* 로그인 버튼은 PC에서만 보이게 */}
                  <Button 
                    onClick={() => {
                      trackEvent('Navigation', 'menu_login');
                      navigate("/login");
                    }}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hidden sm:inline-flex"
                  >
                    로그인
                  </Button>
                </div>
              )}

              <div className="flex items-center sm:hidden ml-4">
                <button
                  onClick={() => {
                    trackEvent('Navigation', 'mobile_menu_toggle');
                    setIsMobileMenuOpen(!isMobileMenuOpen);
                  }}
                  className="text-gray-500 hover:text-gray-700 focus:outline-none"
                  aria-label="메뉴 열기"
                >
                  <Menu className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {isMobileMenuOpen && (
            <div className="sm:hidden py-2 space-y-1 border-t border-gray-200">
              <Link 
                href="/" 
                className={`block px-3 py-2 text-base font-medium hover:bg-gray-50 hover:text-blue-700 ${location === "/" ? "text-blue-600" : "text-gray-900"}`}
                onClick={() => trackEvent('Navigation', 'mobile_menu_home')}
              >
                홈
              </Link>
              <Link 
                href="/keyword-competition-analysis" 
                className={`block px-3 py-2 text-base font-medium hover:bg-gray-50 hover:text-blue-700 ${location.startsWith("/keyword-competition-analysis") ? "text-blue-600" : "text-gray-900"}`}
                onClick={() => trackEvent('Navigation', 'mobile_menu_keyword_analysis')}
              >
                키워드 경쟁률 분석
              </Link>
              <Link 
                href="/product-optimizer/complete" 
                className={`block px-3 py-2 text-base font-medium hover:bg-gray-50 hover:text-blue-700 ${location.startsWith("/product-optimizer") ? "text-blue-600" : "text-gray-900"}`}
                onClick={() => trackEvent('Navigation', 'mobile_menu_product_optimizer')}
              >
                상품명 최적화
              </Link>
              
              <button 
                onClick={() => {
                  trackEvent('Navigation', 'mobile_menu_feedback');
                  setIsFeedbackOpen(true);
                }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-gray-900 hover:bg-gray-50 hover:text-blue-700"
              >
                피드백 및 문의 보내기
              </button>
              <Link
                href="/membership"
                className={`block w-full text-left px-3 py-2 text-base font-medium hover:bg-gray-50 hover:text-blue-700 ${location.startsWith("/membership") ? "text-blue-600" : "text-gray-900"}`}
                onClick={() => trackEvent('Navigation', 'mobile_menu_membership')}
              >
                멤버십
              </Link>
              <button
                onClick={() => {
                  trackEvent('Navigation', 'mobile_menu_usage_guide');
                  window.open("https://chambray-midnight-e7f.notion.site/22b78708053f80579570e27e27559b31?source=copy_link", "_blank")
                }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-gray-900 hover:bg-gray-50 hover:text-blue-700"
              >
                사용법
              </button>
              {/* 로그인/회원가입 버튼: 로그인 상태가 아닐 때만 노출 */}
              {!currentUser && (
                <>
                  <button
                    onClick={() => {
                      trackEvent('Navigation', 'mobile_menu_login');
                      navigate('/login');
                    }}
                    className="block w-full text-left px-3 py-2 text-base font-medium text-blue-600 hover:bg-gray-50 hover:text-blue-700"
                  >
                    로그인/ 회원가입
                  </button>
                
                </>
              )}
            </div>
          )}
        </div>
      </nav>

      <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        {children}
      </main>

      <FeedbackDialog 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
      />
    </div>
  );
}