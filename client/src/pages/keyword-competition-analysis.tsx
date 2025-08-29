import React, { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Info, X, Download } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import LoginPage from "@/components/LoginPage";
import KeywordHistoryComponent from "@/components/KeywordHistory";
import { HistoryService } from "@/lib/historyService";
import { UsageService } from "@/lib/usageService";
import RobotVerificationDialog from "@/components/ui/robot-verification-dialog";
import { useUsage } from "@/contexts/UsageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";

import { CHROME_EXTENSION_ID, CHROME_WEBSTORE_URL } from "@/lib/constants";
import MenuCardGrid from "@/components/MenuCardGrid";

interface KeywordItem {
  key: string;
  value: number;
}

interface ProductInfo {
  rank: number;
  rankReviewCount: number;
  isBundleProduct: boolean;
}

interface AnalysisData {
  keywords: KeywordItem[];
  products?: ProductInfo[];
  [key: string]: any;
}

interface KeywordStat {
  relKeyword: string;
  monthlyTotalQcCnt?: number;
  monthlyPcQcCnt?: number;
  monthlyMobileQcCnt?: number;
  compIdx?: number;
}

interface KeywordStatResponse {
  keywordList: KeywordStat[];
}

// --- 추가: 월간 검색량 파싱 유틸리티 ---
// PC / 모바일 검색량이 "<10" 형태의 문자열로 올 때 숫자 합산 및 표시를 위해 파싱 함수 추가
const parseVolumeValue = (val: number | string | undefined): number => {
  console.log('[parseVolumeValue] Input:', val, 'Type:', typeof val);
  
  if (typeof val === "number") {
    console.log('[parseVolumeValue] Number input, returning:', val);
    return val;
  }
  
  if (typeof val === "string") {
    // "< 10" 또는 "<10" 등 형식 처리 → 9 로 간주
    const m = val.match(/<\s*(\d+)/);
    if (m) {
      const n = Number(m[1]);
      const result = isNaN(n) ? 0 : Math.max(0, n - 1);
      console.log('[parseVolumeValue] String with < format:', val, '→', result);
      return result;
    }
    const n = parseInt(val.replace(/[^0-9]/g, ""), 10);
    const result = isNaN(n) ? 0 : n;
    console.log('[parseVolumeValue] String numeric:', val, '→', result);
    return result;
  }
  
  console.log('[parseVolumeValue] Undefined/null input, returning 0');
  return 0;
};

const calcKeywordVolume = (stat: KeywordStat): number => {
  console.log('[calcKeywordVolume] Input stat:', stat);
  
  if (!stat) {
    console.log('[calcKeywordVolume] No stat provided, returning 0');
    return 0;
  }
  
  if (stat.monthlyTotalQcCnt !== undefined) {
    const volume = parseVolumeValue(stat.monthlyTotalQcCnt as any);
    console.log('[calcKeywordVolume] Using monthlyTotalQcCnt:', stat.monthlyTotalQcCnt, '→', volume);
    return volume;
  }
  
  const pcVolume = parseVolumeValue(stat.monthlyPcQcCnt as any);
  const mobileVolume = parseVolumeValue(stat.monthlyMobileQcCnt as any);
  const total = pcVolume + mobileVolume;
  
  console.log('[calcKeywordVolume] Using PC + Mobile:', {
    pc: stat.monthlyPcQcCnt,
    mobile: stat.monthlyMobileQcCnt,
    pcParsed: pcVolume,
    mobileParsed: mobileVolume,
    total: total
  });
  
  return total;
};

export default function KeywordCompetitionAnalysisPage() {
  const [keyword, setKeyword] = useState("");
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prefillStatsData, setPrefillStatsData] = useState<KeywordStatResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState<string>("상품명 최적화");
  const [productOptimizationLimit, setProductOptimizationLimit] = useState<{ canUse: boolean; currentCount: number; maxCount: number; remainingCount: number } | null>(null);
  const [keywordAnalysisLimitMessage, setKeywordAnalysisLimitMessage] = useState<string | null>(null);

  // 로그인 / 확장프로그램 모달 상태
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [showRobotVerificationModal, setShowRobotVerificationModal] = useState(false);

  // 확장프로그램 데이터 중복 처리 방지 플래그
  const [extensionDataReceived, setExtensionDataReceived] = useState(false);

  // 모바일 체크 및 PC 전용 모달
  const isMobile = useIsMobile();
  const [showPcOnlyModal, setShowPcOnlyModal] = useState(false);

  const { currentUser } = useAuth();

  // 현재 입력에 키워드가 존재하는지 여부
  const hasKeyword = keyword.trim() !== "";

  // Usage context
  const { usageInfo } = useUsage();

  // 상품 최적화 사용량은 UsageContext로부터 동기화됩니다.

  // 상품 최적화 사용량 제한 가져오기
  useEffect(() => {
    if (currentUser?.email) {
      UsageService.checkProductOptimizationLimit(currentUser.email)
        .then(limit => {
          setProductOptimizationLimit(limit);
        })
        .catch(error => {
          console.error('[Usage] Failed to get product optimization limit:', error);
        });
    }
  }, [currentUser?.email]);

  // productOptimizationLimit 동기화 – UsageContext 기반
  useEffect(() => {
    if (usageInfo) {
      setProductOptimizationLimit({
        canUse: usageInfo.productOptimization.current < usageInfo.productOptimization.max,
        currentCount: usageInfo.productOptimization.current,
        maxCount: usageInfo.productOptimization.max,
        remainingCount: usageInfo.productOptimization.remaining
      });
    }
  }, [usageInfo]);

  // 사용량 업데이트 이벤트 리스너
  useEffect(() => {
    const handleUsageUpdate = () => {
      if (currentUser?.email) {
        UsageService.checkProductOptimizationLimit(currentUser.email)
          .then(limit => {
            setProductOptimizationLimit(limit);
          })
          .catch(error => {
            console.error('[Usage] Failed to get product optimization limit:', error);
          });
      }
    };

    window.addEventListener('usage-updated', handleUsageUpdate);
    return () => {
      window.removeEventListener('usage-updated', handleUsageUpdate);
    };
  }, [currentUser?.email]);

  // 메시지 리스너 – 확장프로그램에서 분석 완료 시 결과 수신
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      // 로그 추가: 메시지 수신
      console.log('[LOG] [MSG] message event 수신:', event, 'origin:', event.origin, 'data:', event.data);
      if (event.data.type === "SEO_ANALYSIS_RESULT") {
        const enriched = { ...event.data.data, _pageIndex: 1 };
        setAnalysisData(enriched);
        setIsAnalyzing(false);
        
        // 분석이 성공적으로 완료되면 사용량 증가
        if (currentUser?.email) {
          (async () => {
            try {
              await UsageService.incrementKeywordAnalysis(currentUser.email!);
              console.log('[Usage] Keyword analysis usage incremented after successful analysis');
            } catch (error) {
              console.error('[Usage] Failed to increment usage:', error);
            }
          })();
        }
        
        try {
          localStorage.setItem(
            "latestKeywordAnalysis",
            JSON.stringify({ keyword: keyword.trim(), pageIndex: 1, data: enriched })
          );
        } catch {}
      } else if (event.data.type === "SEO_ANALYSIS_CANCELLED") {
        console.log('[CompetitionAnalysis] 분석 취소 수신');
        setIsAnalyzing(false);
      }
      
      // 확장프로그램에서 직접 분석 데이터를 받는 경우
      if (event.data.type === "EXTENSION_ANALYSIS_DATA") {
        console.log('[Website] 확장프로그램으로부터 분석 데이터 수신:', event.data.data);
        
        // 중복 처리 방지
        if (extensionDataReceived) {
          console.log('[Website] 확장프로그램 데이터가 이미 처리됨, 중복 무시');
          return;
        }
        
        const extensionData = event.data.data;
        
        if (extensionData && extensionData.keyword && extensionData.analysisData) {
          // 사용량 제한 확인 후 초과 시 알림만 표시하고 데이터 무시
          const emailToUse = currentUser?.email || extensionData.userEmail;
          if (emailToUse) {
            try {
              const usageLimit = await UsageService.checkKeywordAnalysisLimit(emailToUse);
              if (!usageLimit.canUse) {
                console.log('[Website] Keyword analysis limit reached – ignoring extension data');
                setKeywordAnalysisLimitMessage(`오늘 키워드 분석 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`);
                setIsAnalyzing(false);
                return;
              }
            } catch (err) {
              console.error('[Usage] Failed to check usage limit (extension data):', err);
              // 오류 시 계속 진행 (보수적)
            }
          }

          // 중복 처리 방지 플래그 설정
          setExtensionDataReceived(true);
          
          // 키워드 설정
          setKeyword(extensionData.keyword);
          
          // 분석 데이터 설정 (확장프로그램의 데이터 구조를 기존 형태로 변환)
          const enrichedData = { 
            ...extensionData.analysisData, 
            _pageIndex: extensionData.pageIndex || 1,
            _fromExtension: true,
            _sourceUrl: extensionData.sourceUrl,
            // categoriesSummary 추가 (카테고리 카드 표시용)
            categoriesSummary: extensionData.analysisData.categories ? 
              extensionData.analysisData.categories.map((cat: any) => ({
                name: cat.key || cat.category || String(cat),
                count: cat.value || 0
              })) : []
          };
          setAnalysisData(enrichedData);
          setIsAnalyzing(false);
          setErrorMsg(null);
          
          // 사용량 증가 (limit 체크를 통과한 경우에만)
          if (emailToUse) {
            (async () => {
              try {
                await UsageService.incrementKeywordAnalysis(emailToUse);
                console.log('[Usage] Keyword analysis usage incremented after extension analysis');
              } catch (error) {
                console.error('[Usage] Failed to increment usage:', error);
              }
            })();
          }
          
          // 월간 검색량 데이터 요청 (확장프로그램 데이터 수신 후 자동 실행)
          if (extensionData.keyword.trim()) {
            setTimeout(() => {
              // react-query의 queryKey가 변경되면 자동으로 새 데이터를 가져옴
              statsQuery.refetch();
            }, 0);
          }
          
          console.log('[Website] 확장프로그램 데이터 처리 완료:', {
            keyword: extensionData.keyword,
            pageIndex: extensionData.pageIndex,
            hasAnalysisData: !!extensionData.analysisData,
            hasKeywords: !!enrichedData.keywords,
            hasKeywordCounts: !!enrichedData.keywordCounts,
            hasTags: !!enrichedData.tags,
            hasPairedData: !!enrichedData.pairedData,
            hasProducts: !!enrichedData.products
          });
        } else {
          console.log('[Website] 확장프로그램 데이터가 없거나 유효하지 않음:', extensionData);
          setIsAnalyzing(false);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [keyword, currentUser, extensionDataReceived]);

  // react-query: 키워드별 월간 검색량 가져오기
  const statsQuery = useQuery<KeywordStatResponse, Error>({
    queryKey: ["keywordStats", keyword],
    queryFn: async () => {
      console.log('[LOG] [API] 네이버 API 호출 시작:', {
        keyword: keyword,
        url: `/api/keyword-competition?keyword=${encodeURIComponent(keyword)}`
      });
      
      const resp = await fetch(`/api/keyword-competition?keyword=${encodeURIComponent(keyword)}`);
      
      console.log('[Frontend] 네이버 API 응답 상태:', {
        status: resp.status,
        statusText: resp.statusText,
        ok: resp.ok,
        headers: Object.fromEntries(resp.headers.entries())
      });
      
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('[Frontend] 네이버 API 오류:', {
          status: resp.status,
          statusText: resp.statusText,
          responseText: txt
        });
        throw new Error(txt || "서버 오류");
      }
      
      const data = await resp.json();
      console.log('[Frontend] 네이버 API 성공 응답:', {
        keyword: keyword,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        keywordListLength: data?.keywordList?.length || 0
      });
      
      return data;
    },
    enabled: false,
    staleTime: 1000 * 60 * 10,
  });

  const { data: statsData, isFetching: isFetchingStats, error: statsError, refetch: refetchStats } = statsQuery;

  // 히스토리 저장 함수
  const saveHistoryToDatabase = async (dataToSave: any) => {
    if (currentUser?.email && keyword.trim()) {
      console.log('[Keyword Analysis] Saving history for:', currentUser.email, keyword.trim());
      try {
        // 1) 레거시 히스토리 – 한도 초과 시 실패할 수 있음
        await HistoryService.saveHistory(
          currentUser.email,
          keyword.trim(),
          'keyword-analysis',
          dataToSave
        );
      } catch (error: any) {
        if (error?.message?.includes('히스토리 저장 제한')) {
          console.log('[Keyword Analysis] History limit reached – skip user history');
        } else {
          console.warn('[Keyword Analysis] Legacy history save failed:', error?.message);
        }
      }

      // 2) 관리자용 컬렉션 – 제한 없이 항상 저장
      await HistoryService.saveKeywordAnalysis(
        currentUser.email,
        currentUser.uid,
        keyword.trim(),
        dataToSave
      );
    } else {
      console.log('[Keyword Analysis] Not saving history - user email:', currentUser?.email, 'keyword:', keyword.trim());
    }
  };

  // 분석 결과 로컬 저장 (월간 검색량 + 리뷰 + 결과) 및 히스토리 저장
  useEffect(() => {
    if (statsData && analysisData && !isAnalyzing) {
      try {
        // 필요 데이터만 추출하여 요약
        const { products: fullProducts, ...analysisCore } = analysisData as any;

        // 필요한 필드만 남긴 products 배열 (rank, rankReviewCount, isBundleProduct)
        const productsSanitized = (fullProducts ?? []).map((p: any)=>({
          rank: p.rank,
          rankReviewCount: p.rankReviewCount ?? 0,
          isBundleProduct: !!p.isBundleProduct
        }));

        const prodSummary = (() => {
          const prods = fullProducts ?? [];
          const withReview = prods.filter((p:any)=>(p.rankReviewCount??0)>0);
          const lowest = [...withReview].sort((a:any,b:any)=>a.rankReviewCount-b.rankReviewCount).slice(0,3).map((p:any)=>({rank:p.rank, review:p.rankReviewCount}));
          const counts = withReview.map((p:any)=>p.rankReviewCount);
          const min = counts.length?Math.min(...counts):0;
          const max = counts.length?Math.max(...counts):0;
          const mean = counts.length?Math.round(counts.reduce((a:number,b:number)=>a+b,0)/counts.length):0;
          const bundleProducts = prods.filter((p:any)=>p.isBundleProduct);
          const bundleRanks = bundleProducts.slice(0,10).map((p:any)=>p.rank);
          return { lowest, reviewStats:{min, mean, max}, bundleRanks, bundleCount: bundleProducts.length };
        })();

        // 카테고리 정보 추출
        const categoriesSummary = (() => {
          const categories = analysisData.categories || [];
          
          // categories가 {key, value} 객체 배열인 경우
          if (categories.length > 0 && categories[0] && typeof categories[0] === 'object' && (categories[0].key || categories[0].category)) {
            return categories
              .filter((cat: any) => cat && (cat.key || cat.category))
              .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
              .map((cat: any) => ({
                name: cat.key || cat.category,
                count: cat.value || 0
              }));
          }
          
          const uniqueCategories = categories.length > 0 ? categories : 
            (fullProducts ?? []).reduce((acc: string[], p: any) => {
              if (p.category && !acc.includes(p.category)) {
                acc.push(p.category);
              }
              return acc;
            }, []);
          
          // 카테고리를 문자열 형태로 변환
          return uniqueCategories.map((cat: any) => {
            if (typeof cat === 'string') {
              return cat;
            } else if (typeof cat === 'object' && cat !== null) {
              // 객체인 경우 카테고리 경로를 > 기호로 연결
              if (cat.path) {
                return Array.isArray(cat.path) ? cat.path.join(' > ') : String(cat.path);
              } else if (cat.name) {
                return String(cat.name);
              } else if (cat.category) {
                return String(cat.category);
              } else {
                // 객체의 값들을 > 기호로 연결
                const catValues = Object.values(cat).filter((v: any) => v && typeof v === 'string');
                return catValues.length > 0 ? catValues.join(' > ') : '알 수 없음';
              }
            }
            return String(cat);
          }).filter((cat: string) => cat && cat !== '알 수 없음');
        })();

        const vol = (() => {
          const kwList = (statsData || prefillStatsData)?.keywordList ?? [];
          const kw = kwList.find((k: any) => k.relKeyword.toLowerCase() === keyword.trim().toLowerCase());
          
          console.log('[Local Storage] Volume calculation:', {
            keyword: keyword.trim(),
            kwListLength: kwList.length,
            availableKeywords: kwList.map((k: any) => k.relKeyword),
            foundKw: !!kw,
            kw: kw
          });
          
          const volume = kw ? calcKeywordVolume(kw) : 0;
          
          console.log('[Local Storage] Final volume:', volume);
          
          return volume;
        })();

        const dataToSave = {
          analysisData: {
            ...analysisCore,
            products: productsSanitized,
            // 예시 상품명 추출을 위해 원본 상품 정보도 보존 (상위 5개만)
            productsFull: (fullProducts ?? []).slice(0, 5).map((p: any) => ({
              rank: p.rank,
              productTitle: p.productTitle || p.title || p.name,
              rankReviewCount: p.rankReviewCount ?? 0,
              isBundleProduct: !!p.isBundleProduct
            })),
          },
          statsData: statsData || prefillStatsData,
          productsSummary: prodSummary,
          categoriesSummary: categoriesSummary,
          _pageIndex: 1,
          _vol: vol,
          savedAt: Date.now()
        };
        localStorage.setItem("latestKeywordFull", JSON.stringify(dataToSave));

        // 히스토리에 저장 (로그인된 사용자만)
        (async () => {
          await saveHistoryToDatabase(dataToSave);
        })();
      } catch {}
    }
  }, [statsData, analysisData, isAnalyzing, keyword, currentUser]);



  // 새로고침 시 저장된 분석 결과를 자동 복원하지 않도록 변경
  // (필요 시 동일 키워드를 다시 검색하면 캐시를 활용함)

  // 키워드가 사라지면 화면 결과를 초기화
  useEffect(() => {
    if (!hasKeyword) {
      setAnalysisData(null);
      setErrorMsg(null);
      setExtensionDataReceived(false); // 확장프로그램 데이터 수신 플래그 초기화
    }
  }, [hasKeyword]);

  // 확장프로그램 설치 여부 확인 함수 (QuickStep1Collect와 동일 로직)
  const checkExtensionInstalled = (): Promise<boolean> => {
    return new Promise((resolve) => {
      let resolved = false;

      const messageHandler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        if (event.data.type === "EXTENSION_STATUS" && !resolved) {
          resolved = true;
          window.removeEventListener("message", messageHandler);
          resolve(event.data.installed === true);
        }
      };

      window.addEventListener("message", messageHandler);
      window.postMessage({ type: "CHECK_EXTENSION" }, window.location.origin);

      if (typeof (window as any).chrome !== "undefined" && (window as any).chrome.runtime && (window as any).chrome.runtime.sendMessage) {
        try {
          (window as any).chrome.runtime.sendMessage(
            CHROME_EXTENSION_ID,
            { type: "CHECK_EXTENSION_INSTALLED" },
            (response: any) => {
              if (!resolved) {
                if ((window as any).chrome.runtime.lastError) {
                  resolved = true;
                  window.removeEventListener("message", messageHandler);
                  resolve(false);
                } else if (response && response.installed) {
                  resolved = true;
                  window.removeEventListener("message", messageHandler);
                  resolve(true);
                }
              }
            }
          );
        } catch {
          /* ignore */
        }
      }

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("message", messageHandler);
          resolve(false);
        }
      }, 1000);
    });
  };

  // 네이버 쇼핑 페이지 활성화 함수
  const activateNaverShoppingPage = () => {
    window.postMessage(
      {
        type: "ACTIVATE_NAVER_SHOPPING_TAB",
        data: {}
      },
      window.location.origin
    );
  };

  const handleSearch = useCallback(async () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    // 모바일 체크 - PC 전용 기능
    if (isMobile) {
      if (!currentUser) {
        setShowLoginModal(true);
        return;
      } else {
        setShowPcOnlyModal(true);
        return;
      }
    }

    // 공백 포함이면 오류 메시지 표시 후 중단
    if (/\s/.test(trimmed)) {
      console.log('[LOG] [INPUT] 공백 포함된 키워드 입력:', trimmed);
      setErrorMsg("띄어쓰기 없이 입력해주세요");
      setAnalysisData(null);
      setIsAnalyzing(false);
      return;
    }

    // 1) 로그인 체크
    if (!currentUser) {
      console.log('[LOG] [AUTH] 로그인 필요, currentUser:', currentUser);
      trackEvent('DropOff', 'noLogin', null, {
        feature: 'keyword_analysis',
        query: trimmed,
      });
      setShowLoginModal(true);
      return;
    }

    // 2) 사용량 제한 확인
    try {
      const usageLimit = await UsageService.checkKeywordAnalysisLimit(currentUser.email!);
      if (!usageLimit.canUse) {
        console.log('[LOG] [USAGE] 키워드 분석 사용량 초과:', usageLimit);
        setKeywordAnalysisLimitMessage(`오늘 키워드 분석 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`);
        return;
      }
      setKeywordAnalysisLimitMessage(null);
    } catch (error) {
      console.error('[LOG] [USAGE] Failed to check usage limit:', error);
      // 사용량 확인 실패 시에도 분석 진행
    }

    // 2) 확장프로그램 설치 체크
    const isExt = await checkExtensionInstalled();
    console.log('[LOG] [EXT] 확장프로그램 설치 여부:', isExt);
    if (!isExt) {
      trackEvent('DropOff', 'noExtension', null, {
        feature: 'keyword_analysis',
        query: trimmed,
      });
      setShowExtensionModal(true);
      return;
    }

    // 3) 동일 키워드 캐시 활용 (로그인/확장프로그램 모두 충족 시에만)
    {
      try {
        const raw = localStorage.getItem("latestKeywordFull");
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.keyword === trimmed && cached.analysisData && cached.statsData) {
            console.log('[LOG] [CACHE] 동일 키워드 캐시 활용:', cached);
            setAnalysisData(cached.analysisData);
            setPrefillStatsData(cached.statsData);
            setIsAnalyzing(false);
            setErrorMsg(null);
            return;
          }
        }
      } catch (e) {
        console.error('[LOG] [CACHE] 캐시 파싱 오류:', e);
      }
    }

    // 4) 캐시가 없고 정상 진행 필요
    setIsAnalyzing(true);
    setAnalysisData(null);
    setErrorMsg(null);
    trackEvent('Analyze', 'keyword_analysis_start', null, { query: trimmed });

    // 월간 검색량 API 호출
    if (refetchStats) {
      refetchStats();
    }

    // 이전 저장된 분석 결과 제거
    try {
      localStorage.removeItem("latestKeywordAnalysis");
    } catch {}

    // pageIndex: 1 (첫 페이지 기준) – 확장프로그램 분석
    console.log('[LOG] [MSG] postMessage: START_SEO_ANALYSIS', { productName: trimmed });
    window.postMessage(
      {
        type: "START_SEO_ANALYSIS",
        data: {
          productName: trimmed,
          pageIndex: 1,
          timeoutMs: 0, // 최적화: 5000ms → 2000ms
        },
      },
      window.location.origin
    );
  }, [keyword, currentUser]);

  // URL 파라미터 확인 및 확장프로그램 데이터 처리
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');
    const keywordParam = urlParams.get('keyword');
    console.log('[LOG] [URL] source:', source, 'keyword:', keywordParam, 'location:', window.location.href);
    
    // 확장프로그램에서 온 요청인 경우를 먼저 처리
    if (source === 'extension' && keywordParam) {
      console.log('[Website] 확장프로그램에서 온 요청 감지:', { keywordParam });
      
      // 키워드만 미리 설정 (데이터는 메시지로 받을 예정)
      setKeyword(keywordParam);
      setIsAnalyzing(true); // 데이터 수신 대기 상태
      
      // URL에서 source, keyword 파라미터 모두 제거 (깔끔한 URL 유지 + 중복 실행 방지)
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('source');
      newUrl.searchParams.delete('keyword');
      window.history.replaceState({}, '', newUrl.toString());
      return; // 확장프로그램 요청이면 여기서 종료
    }
    
    // 홈페이지에서 키워드와 함께 온 경우 자동 분석 실행 (확장프로그램 요청이 아닌 경우만)
    if (keywordParam && !source && !extensionDataReceived) {
      console.log('[Website] 홈페이지에서 키워드와 함께 온 요청 감지:', { keywordParam });
      
      // URL에서 keyword 파라미터 제거 (깔끔한 URL 유지)
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('keyword');
      window.history.replaceState({}, '', newUrl.toString());
      
      // 키워드 설정 후 분석 실행
      setKeyword(keywordParam);
      
      // 키워드가 설정된 후 자동으로 분석 실행 (약간의 지연 후)
      const timer = setTimeout(async () => {
        console.log('[Website] 자동 분석 실행:', keywordParam);
        
        const trimmed = keywordParam.trim();
        if (!trimmed) return;

        // 공백 포함이면 오류 메시지 표시 후 중단
        if (/\s/.test(trimmed)) {
          console.log('[LOG] [INPUT] 공백 포함된 키워드 입력 (자동 분석):', trimmed);
          setErrorMsg("띄어쓰기 없이 입력해주세요");
          setAnalysisData(null);
          setIsAnalyzing(false);
          return;
        }

        // 1) 로그인 체크
        if (!currentUser) {
          console.log('[LOG] [AUTH] 로그인 필요 (자동 분석), currentUser:', currentUser);
          trackEvent('DropOff', 'noLogin', null, {
            feature: 'keyword_analysis',
            query: trimmed,
          });
          setShowLoginModal(true);
          return;
        }

        // 2) 사용량 제한 확인
        try {
          const usageLimit = await UsageService.checkKeywordAnalysisLimit(currentUser.email!);
          if (!usageLimit.canUse) {
            console.log('[LOG] [USAGE] 키워드 분석 사용량 초과 (자동 분석):', usageLimit);
            setKeywordAnalysisLimitMessage(`오늘 키워드 분석 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`);
            return;
          }
          setKeywordAnalysisLimitMessage(null);
        } catch (error) {
          console.error('[LOG] [USAGE] Failed to check usage limit (자동 분석):', error);
          // 사용량 확인 실패 시에도 분석 진행
        }

        // 2) 확장프로그램 설치 체크
        const isExt = await checkExtensionInstalled();
        console.log('[LOG] [EXT] 확장프로그램 설치 여부 (자동 분석):', isExt);
        if (!isExt) {
          trackEvent('DropOff', 'noExtension', null, {
            feature: 'keyword_analysis',
            query: trimmed,
          });
          setShowExtensionModal(true);
          return;
        }

        // 3) 동일 키워드 캐시 활용 (로그인/확장프로그램 모두 충족 시에만)
        {
          try {
            const raw = localStorage.getItem("latestKeywordFull");
            if (raw) {
              const cached = JSON.parse(raw);
              if (cached?.keyword === trimmed && cached.analysisData && cached.statsData) {
                console.log('[LOG] [CACHE] 동일 키워드 캐시 활용 (자동 분석):', cached);
                setAnalysisData(cached.analysisData);
                setPrefillStatsData(cached.statsData);
                setIsAnalyzing(false);
                setErrorMsg(null);
                return;
              }
            }
          } catch (e) {
            console.error('[LOG] [CACHE] 캐시 파싱 오류 (자동 분석):', e);
          }
        }

        // 4) 캐시가 없고 정상 진행 필요
        setIsAnalyzing(true);
        setAnalysisData(null);
        setErrorMsg(null);
        trackEvent('Analyze', 'keyword_analysis_start', null, { query: trimmed });

        // 월간 검색량 API 호출
        if (refetchStats) {
          refetchStats();
        }

        // 이전 저장된 분석 결과 제거
        try {
          localStorage.removeItem("latestKeywordAnalysis");
        } catch {}

        // pageIndex: 1 (첫 페이지 기준) – 확장프로그램 분석
        console.log('[LOG] [MSG] postMessage: START_SEO_ANALYSIS (자동 분석)', { productName: trimmed });
        window.postMessage(
          {
            type: "START_SEO_ANALYSIS",
            data: {
              productName: trimmed,
              pageIndex: 1,
              timeoutMs: 0, // 최적화: 5000ms → 2000ms
            },
          },
          window.location.origin
        );
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [currentUser, refetchStats]);

  // Naver API 오류 처리 – Invalid Parameter
  useEffect(() => {
    if (statsError) {
      console.log('[Frontend] 네이버 API 에러 처리:', {
        error: statsError,
        message: statsError.message,
        name: statsError.name,
        stack: statsError.stack
      });
      
      try {
        const msg = statsError.message;
        console.log('[Frontend] 에러 메시지 분석:', {
          message: msg,
          includesInvalidParameter: msg.includes("Invalid Parameter"),
          includesNaverApiError: msg.includes("naver api error"),
          includesMissingKeyword: msg.includes("Missing query parameter keyword"),
          includesServerError: msg.includes("Server not configured")
        });
        
        if (msg.includes("Invalid Parameter") || msg.includes("naver api error")) {
          setErrorMsg("띄어쓰기 없이 입력해주세요");
          setIsAnalyzing(false);
        } else if (msg.includes("Missing query parameter keyword")) {
          setErrorMsg("키워드를 입력해주세요");
          setIsAnalyzing(false);
        } else if (msg.includes("Server not configured")) {
          setErrorMsg("서버 설정 오류가 발생했습니다");
          setIsAnalyzing(false);
        } else {
          setErrorMsg("네이버 API 오류가 발생했습니다");
          setIsAnalyzing(false);
        }
      } catch (parseError) {
        console.error('[Frontend] 에러 메시지 파싱 실패:', parseError);
        setErrorMsg("알 수 없는 오류가 발생했습니다");
        setIsAnalyzing(false);
      }
    }
  }, [statsError]);

  const formatRank = (absRank: number) => {
    const within = ((absRank - 1) % 40) + 1;
    return `${within}위`;
  };

  const compactCount = (val: number): string => {
    const toTwo = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);
    if (val >= 10000) {
      return `${toTwo(val / 10000)}만개`;
    }
    return `${val.toLocaleString()}개`;
  };

  const handleMenuNavigate = (e: React.MouseEvent, path: string) => {
    // 사용량 초과 시 클릭 방지
    if (productOptimizationLimit && !productOptimizationLimit.canUse) {
      // 링크 기본 동작 차단
      e.preventDefault();
      return;
    }

    if (analysisData && keyword.trim()) {
      e.preventDefault();

      // GA4 – 판단 섹션 최적화 버튼 클릭 추적
      const eventName = path.includes('complete') ? 'menu_product_optimizer_complete' : 'menu_product_optimizer_quick';
      trackEvent('CardMenu', eventName, null, {
        from_page: '키워드_경쟁률_분석',
        section: '판단_섹션',
        keyword: keyword.trim(),
      });

      setPendingPath(path);
      if (path.includes("complete")) setTargetLabel("완벽한 상품명 최적화");
      else if (path.includes("quick")) setTargetLabel("빠른 상품명 최적화");
      setConfirmOpen(true);
    }
  };

  // 상단 메뉴 카드용 핸들러 - 확인 모달 없이 기본 화면으로 이동
  const [, navigate] = useLocation();

  const handleTopMenuNavigate = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    // GA – 메뉴 카드 클릭 추적
    const eventName = path.includes('complete') ? 'menu_product_optimizer_complete' : 'menu_product_optimizer_quick';
    trackEvent('CardMenu', eventName, null, {
      from_page: '키워드_경쟁률_분석',
    });
    // 기본 화면이 뜨도록 모든 관련 데이터 제거
    try {
      sessionStorage.removeItem("allowPrefill");
      localStorage.removeItem("latestKeywordAnalysis");
    } catch {}
    
    // 현재 페이지에서 다시 선택한 경우 기본 화면으로 리셋하기 위해 새로고침
    if (window.location.pathname === path) {
      // 동일 페이지 – 로컬 상태 초기화
      resetToInitial();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate(path);
    }
  };

  const proceedNavigation = async () => {
    if (pendingPath && analysisData && keyword.trim()) {
      try { 
        // 현재 키워드와 분석 데이터를 localStorage에 저장 (페이지 인덱스 1로 설정)
        const currentAnalysisData = {
          keyword: keyword.trim(),
          data: {
            ...analysisData,
            _pageIndex: 1 // 키워드 경쟁률 분석에서 온 경우 항상 1페이지로 설정
          },
          statsData: statsData || prefillStatsData,
          pageIndex: 1, // 히스토리 저장용 페이지 인덱스
          savedAt: Date.now()
        };
        localStorage.setItem("latestKeywordAnalysis", JSON.stringify(currentAnalysisData));
        
        // 프리필 허용 플래그 설정
        sessionStorage.setItem("allowPrefill", "1");
        
        // 최적화 히스토리에도 즉시 저장 (페이지 1)
        if (currentUser?.email) {
          const histType = pendingPath.includes("complete") ? "complete-optimizer" : pendingPath.includes("quick") ? "quick-optimizer" : null;
          if (histType) {
            const dataToSave = {
              ...analysisData,
              _pageIndex: 1,
              _statsData: statsData || prefillStatsData || undefined
            };
            try {
              await HistoryService.saveHistory(
                currentUser.email,
                keyword.trim(),
                histType as any,
                dataToSave,
                1
              );
              console.log(`[Navigation] ${histType} 히스토리에 저장 완료 (페이지 1)`);
            } catch (error: any) {
              console.warn(`[Navigation] Failed to save ${histType} history:`, error.message);
              // 히스토리 저장 실패 시 조용히 처리 (분석 결과는 정상적으로 표시)
              if (error.message && error.message.includes('히스토리 저장 제한')) {
                console.log(`[Navigation] ${histType} history limit reached, but navigation completed successfully`);
              }
            }
          }
          
          // 상품 최적화 사용량 증가 (완벽한 상품 최적화 또는 빠른 상품 최적화로 이동할 때)
          if (pendingPath.includes("complete") || pendingPath.includes("quick")) {
            try {
              await UsageService.incrementProductOptimization(currentUser.email);
              console.log('[Usage] Product optimization usage incremented after navigation to optimizer');
            } catch (error) {
              console.error('[Usage] Failed to increment product optimization usage:', error);
            }
          }
        }
        
        console.log('[Navigation] 상품 최적화 진행 (페이지 1로 설정):', {
          keyword: keyword.trim(),
          path: pendingPath,
          pageIndex: 1,
          hasAnalysisData: !!analysisData,
          hasStatsData: !!(statsData || prefillStatsData)
        });
      } catch (error) {
        console.error('[Navigation] Failed to save current analysis data:', error);
      }
      // 페이지 완전 새로고침으로 데이터 전달 (분석 결과 화면 표시)
      window.location.href = pendingPath;
    } else {
      console.warn('[Navigation] 네비게이션 실패:', {
        pendingPath,
        hasAnalysisData: !!analysisData,
        keyword: keyword.trim()
      });
    }
    setConfirmOpen(false);
  };

  // Helper to get products-related stats from analysisData
  const getProductMetrics = (ad: any) => {
    if (ad.products && Array.isArray(ad.products)) {
      const prods = ad.products;
      const withReview = prods.filter((p:any)=>(p.rankReviewCount??0)>0);
      const low = [...withReview].sort((a:any,b:any)=>a.rankReviewCount-b.rankReviewCount).slice(0,3);
      const bundleCount = prods.filter((p:any)=>p.isBundleProduct).length;
      return { lowReviewProducts: low, bundleCount };
    }
    if (ad.productsSummary) {
      return {
        lowReviewProducts: ad.productsSummary.lowest ?? [],
        bundleCount: ad.productsSummary.bundleCount ?? 0
      };
    }
    return { lowReviewProducts: [], bundleCount: 0 };
  };

  // 기본 화면으로 리셋하는 헬퍼
  const resetToInitial = () => {
    setKeyword('');
    setAnalysisData(null);
    setErrorMsg(null);
    setIsAnalyzing(false);
    try {
      localStorage.removeItem('latestKeywordAnalysis');
      localStorage.removeItem('latestKeywordFull');
      sessionStorage.removeItem('allowPrefill');
    } catch {}
  };

  //  예시 데이터 자동 주입 제거됨 - 비로그인 사용자에게는 빈 화면 표시
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    // 예시 데이터 자동 주입 로직 제거됨
  }, [currentUser]);

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={0}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-8 space-y-6">
        {/* 경험 헤더 */}
        <h2 className="text-center text-base text-gray-700 mb-3 font-semibold mt-6">
          {isMobile ? (
            <>
              실제 이용자 중 <span className="font-bold text-blue-600">55%가</span> <span className="font-bold text-blue-600">상품명만 바꿔서</span><br/>
              <span className="font-bold text-blue-600">순위 상승을 경험</span>했어요!
            </>
          ) : (
            <>
              실제 이용자 중 <span className="font-bold text-blue-600">55%가</span> <span className="font-bold text-blue-600">상품명만 바꿔서</span> <span className="font-bold text-blue-600">순위 상승을 경험</span>했어요!
            </>
          )}
        </h2>

        {/* 상단 메뉴 카드 */}
        <MenuCardGrid 
          currentPageId="keyword-analysis"
          onCardClick={handleTopMenuNavigate}
        />

          {/* 사용 안내 말풍성 */}
          {!isAnalyzing && !analysisData && (
            <div className="max-w-2xl mx-auto mb-6 relative">
              <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-200 rounded-2xl p-4 shadow-md relative">
                <div className="flex items-start gap-3">
                  <div className="bg-green-500 rounded-full p-1.5 flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-800 mb-1">언제 사용하면 좋을까요?</p>
                    <p className="text-sm text-green-700 leading-relaxed mb-1">
                      키워드의 <span className="font-semibold">월간 검색량과 상위노출 경쟁률을 확인</span>하고 싶을 때 사용!
                      <br/>검색량과 <span className="font-semibold">리뷰, 순위, 묶음상품 데이터를 기반으로 상위 노출 가능성을 한눈에 확인</span>할 수 있어요.
                    </p>
                  </div>
                </div>
                {/* 말풍성 꼬리 */}
                <div className="absolute left-8 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-green-200"></div>
                <div className="absolute left-8 -bottom-1.5 w-0 h-0 border-l-7 border-r-7 border-t-7 border-l-transparent border-r-transparent border-t-green-100"></div>
              </div>
            </div>
          )}

          {/* 검색 입력 카드 */}
          <Card className="border-2 border-green-100 shadow-lg max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className={isMobile ? "h-4 w-4 text-green-600" : "h-5 w-5 text-green-600"} />
                <span>상품 메인 키워드 입력</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={isMobile ? "flex flex-row gap-2 items-center" : "flex flex-row gap-4 items-center"}>
                <Input
                  placeholder="분석할 키워드를 입력하세요 (예: 토마토)"
                  value={keyword}
                  onChange={(e) => {
                    const val = e.target.value;
                    setKeyword(val);
                    if (val === "") {
                      setAnalysisData(null);
                      setPrefillStatsData(null as any);
                    }
                  }}
                  onFocus={() => {
                    // 예시 데이터 자동 제거 로직 삭제됨
                  }}
                  className={isMobile ? "flex-1 w-full min-w-0 text-sm py-3 border-2 border-gray-200 focus:border-green-500 transition-colors" : "flex-1 w-full min-w-0 text-lg py-6 border-2 border-gray-200 focus:border-green-500 transition-colors"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isAnalyzing || !keyword.trim()}
                  className={isMobile ? "px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm border-2 border-green-600" : "px-8 py-6 bg-green-600 hover:bg-green-700 text-white font-semibold border-2 border-green-600"}
                >
                  {isAnalyzing ? "조회 중..." : "분석"}
                </Button>
              </div>
              <p className="text-sm text-gray-500">* 해당 키워드의 월간 검색량과 경쟁률을 분석합니다.</p>
            </CardContent>
          </Card>


          {/* 키워드 분석 사용량 제한 메시지 */}
          {keywordAnalysisLimitMessage && (
            <div className="max-w-2xl mx-auto">
              <Card className="border-2 border-red-200 bg-red-50 shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-red-700">{keywordAnalysisLimitMessage}</p>
                    <Link 
                      href="/membership" 
                      className="inline-flex items-center px-2 py-1 text-xs font-normal text-red-600 hover:text-blue-600 border border-red-300 hover:border-blue-300 rounded transition-all duration-200 ml-2"
                    >
                      부스터멤버십으로 사용량 걱정없이 쓰기!
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 히스토리 */}
          {currentUser && !hasKeyword && (
            <div className="max-w-2xl mx-auto mt-4">
              <KeywordHistoryComponent
                type="keyword-analysis"
                onKeywordSelect={(selectedKeyword, data) => {
                  console.log('[History] 히스토리에서 키워드 선택:', selectedKeyword, data);
                  setKeyword(selectedKeyword);
                  if (data.analysisData && data.statsData) {
                    setAnalysisData(data.analysisData);
                    setPrefillStatsData(data.statsData);
                    setErrorMsg(null);
                    
                    // 선택한 히스토리 데이터를 localStorage에 저장 (상품 최적화에서 사용하기 위해)
                    try {
                      const historyAnalysisData = {
                        keyword: selectedKeyword,
                        data: data.analysisData,
                        statsData: data.statsData,
                        savedAt: Date.now()
                      };
                      localStorage.setItem("latestKeywordAnalysis", JSON.stringify(historyAnalysisData));
                      console.log('[History] localStorage에 히스토리 데이터 저장 완료:', selectedKeyword);
                    } catch (error) {
                      console.error('[History] localStorage 저장 실패:', error);
                    }
                  }
                }}
              />
            </div>
          )}

          {/* 진행바 (데이터 수집 중) */}
          {(isFetchingStats || isAnalyzing) && hasKeyword && (
            <div className="flex items-center gap-2 mt-4 max-w-2xl mx-auto w-full px-2">
              <div className="flex-1 h-1 bg-green-100 overflow-hidden rounded animate-pulse">
                <div className="w-full h-full bg-gradient-to-r from-green-400 to-green-600" />
              </div>
              <span className="text-sm text-green-600 whitespace-nowrap">데이터 수집 중...</span>
            </div>
          )}

        {/* 결과 */}
        {errorMsg && (
          <p className="text-center text-red-600 text-sm">{errorMsg}</p>
        )}
          {statsError && !statsError.message.includes("Invalid Parameter") && !statsError.message.includes("naver api error") && (
            <p className="text-center text-red-600 text-sm">서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</p>
          )}

          {/* 경쟁률 분석 결과 */}
          {hasKeyword && analysisData && (statsData || prefillStatsData) && (() => {
            // 월간 검색량 → 사이즈 구분
            const effectiveStats = statsData ?? prefillStatsData!;
            const mainStat = effectiveStats.keywordList.find((k) => k.relKeyword.toLowerCase() === keyword.trim().toLowerCase());
            
            console.log('[Competition Analysis] Debug info:', {
              keyword: keyword.trim(),
              hasStatsData: !!statsData,
              hasPrefillStatsData: !!prefillStatsData,
              keywordListLength: effectiveStats.keywordList?.length || 0,
              availableKeywords: effectiveStats.keywordList?.map(k => k.relKeyword) || [],
              foundMainStat: !!mainStat,
              mainStat: mainStat
            });
            
            const mainVol = mainStat ? calcKeywordVolume(mainStat) : null;
            
            console.log('[Competition Analysis] Final calculation:', {
              mainVol: mainVol,
              willShowDash: mainVol === null
            });
            
            const sizeLabel = mainVol === null ? "검색량 정보 없음" : mainVol < 5000 ? "소형 키워드" : mainVol < 20000 ? "중형 키워드" : "대형 키워드";

            // 최소 리뷰 수 3개 기준 경쟁 강도 판단 (리뷰 수만 사용)
            const { lowReviewProducts, bundleCount: bundleProductCount } = getProductMetrics(analysisData);
            const minLowReview = lowReviewProducts.length ? (lowReviewProducts[0].review ?? lowReviewProducts[0].rankReviewCount ?? 0) : 0;

            let competitionLevel: "매우 낮음" | "낮음" | "중간" | "높음" = "매우 낮음";
            if (minLowReview <= 10) competitionLevel = "매우 낮음";
            else if (minLowReview <= 50) competitionLevel = "낮음";
            else if (minLowReview <= 100) competitionLevel = "중간";
            else competitionLevel = "높음";

            // 노출 수준 판단 – 최상위(베스트) 순위 (리뷰 수 기준)
            const candidateRanks = lowReviewProducts.map((p:any)=>p.rank);
            const bestRank = candidateRanks.length ? Math.min(...candidateRanks) : 999;
            let exposureLevel: "상위" | "중간" | "하위" = "하위";
            if (bestRank <= 10) exposureLevel = "상위";
            else if (bestRank <= 30) exposureLevel = "중간";
            else exposureLevel = "하위";

            // 묶음상품 개수에 따른 신규상품 판매기회 수준 판단
            let bundleOpportunity: "매우 많음" | "보통" | "적음" | "거의 없음" | "전혀 없음" = "매우 많음";
            if (bundleProductCount >= 0 && bundleProductCount <= 10) bundleOpportunity = "매우 많음";
            else if (bundleProductCount >= 11 && bundleProductCount <= 20) bundleOpportunity = "보통";
            else if (bundleProductCount >= 21 && bundleProductCount <= 30) bundleOpportunity = "적음";
            else if (bundleProductCount >= 31 && bundleProductCount <= 39) bundleOpportunity = "거의 없음";
            else if (bundleProductCount === 40) bundleOpportunity = "전혀 없음";

            // 디버깅: 기준 값 출력
            console.log("[Competition] minLowReview", minLowReview);
            console.log("[Exposure] bestRank", bestRank);
            console.log("[Bundle] bundleProductCount", bundleProductCount, "opportunity", bundleOpportunity);

                        // 메시지 매트릭스 (신규상품 기회-경쟁률-노출)
                          const msgMap: Record<string, string> = {
                // 매우 많음 (0-10개 묶음상품)
                "매우 많음-매우 낮음-상위": "단일 상품의 상품명 최적화만으로 상위 노출이 충분히 가능해요!",
                "매우 많음-매우 낮음-중간": "단일 상품의 상품명 최적화만으로 순위 상승이 충분히 가능해요",
                "매우 많음-매우 낮음-하위": "단일 상품의 상품명 최적화만으로 1페이지 진입이 충분히 가능해요!",
                "매우 많음-낮음-상위": "단일 상품의 상품명 최적화만으로 상위 노출이 기대돼요!",
                "매우 많음-낮음-중간": "단일 상품의 상품명 최적화만으로 순위 상승이 기대돼요!",
                "매우 많음-낮음-하위": "단일 상품의 상품명 최적화만으로 1페이지 진입이 기대돼요!",
                "매우 많음-중간-상위": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰와 함께 관리하면 상위 노출이 가능해요",
                "매우 많음-중간-중간": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰를 늘리며 단계적으로 순위를 올려보세요.",
                "매우 많음-중간-하위": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰를 쌓아야 해요.",
                "매우 많음-높음-상위": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화와 함께 클릭 수, 판매, 리뷰를 쌓으면 큰 매출 기회를 만들 수 있어요.",
                "매우 많음-높음-중간": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화만으로는 부족하며, 클릭 수, 판매, 리뷰를 늘리며 단계적으로 순위를 올려보세요.",
                "매우 많음-높음-하위": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화만으로는 상위 노출이 어렵습니다. 마케팅이 함께 필요해요.",
              
                              // 보통 (11-20개 묶음상품)
                "보통-매우 낮음-상위": "단일 상품의 상품명 최적화만으로 상위 노출이 가능해요",
                "보통-매우 낮음-중간": "단일 상품의 상품명 최적화만으로 순위 상승이 가능해요",
                "보통-매우 낮음-하위": "단일 상품의 상품명 최적화만으로 1페이지 진입이 가능해요",
                "보통-낮음-상위": "단일 상품의 상품명 최적화만으로 상위 노출 가능성이 있어요",
                "보통-낮음-중간": "단일 상품의 상품명 최적화만으로 순위 상승 가능성이 있어요",
                "보통-낮음-하위": "단일 상품의 상품명 최적화만으로 1페이지 진입 가능성이 있어요",
                "보통-중간-상위": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰와 함께 관리하면 순위 상승이 가능해요",
                "보통-중간-중간": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰를 늘리며 단계적으로 순위를 올려보세요.",
                "보통-중간-하위": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰를 쌓아야 해요.",
                "보통-높음-상위": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화와 함께 판매와 클릭 수, 판매, 리뷰를 쌓으면 매출 기회를 만들 수 있어요.",
                "보통-높음-중간": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화만으로는 부족하며, 클릭 수, 판매, 리뷰를 늘리며 단계적으로 순위를 올려보세요.",
                "보통-높음-하위": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화만으로는 상위 노출이 어렵습니다. 마케팅을 병행하며 전략적으로 접근해야 해요.",

                              // 적음 (21-30개 묶음상품)
                "적음-매우 낮음-상위": "단일 상품의 상품명 최적화만으로 순위 상승 가능성이 높지만, 묶음상품 영향으로 상위 노출은 어려울 수 있어요",
                "적음-매우 낮음-중간": "단일 상품의 상품명 최적화만으로 순위 상승 가능성이 높지만, 묶음상품 영향으로 상위 노출은 어려울 수 있어요",
                "적음-매우 낮음-하위": "단일 상품의 상품명 최적화만으로 순위 상승 가능성이 높지만, 묶음상품 영향으로 상위 노출은 어려울 수 있어요",
                "적음-낮음-상위": "단일 상품의 상품명 최적화만으로 순위 상승이 가능하지만, 묶음상품 영향으로 상위 노출은 어려울 수 있어요",
                "적음-낮음-중간": "단일 상품의 상품명 최적화만으로 순위 상승이 가능하지만, 묶음상품 영향으로 상위 노출은 어려울 수 있어요",
                "적음-낮음-하위": "단일 상품의 상품명 최적화만으로 순위 상승이 가능하지만, 묶음상품 영향으로상위 노출은 어려울 수 있어요",
                "적음-중간-상위": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰와 함께 관리하면 순위 상승이 가능해요",
                "적음-중간-중간": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰를 늘리며 단계적으로 순위를 올려보세요.",
                "적음-중간-하위": "단일 상품의 상품명 최적화는 기본! 클릭 수, 판매, 리뷰를 쌓아야 해요.",
                "적음-높음-상위": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화와 함께 클릭 수, 판매, 리뷰를 쌓으면 큰 매출 기회를 만들 수 있어요.",
                "적음-높음-중간": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화만으로는 부족하며, 클릭 수, 판매, 리뷰를 늘리며 단계적으로 순위를 올려보세요.",
                "적음-높음-하위": "클릭 수, 판매, 리뷰 기반의 노출입니다. 상품명 최적화만으로는 상위 노출이 어렵습니다. 마케팅을 병행하며 전략적으로 접근해야 해요.",
                              // 거의 없음 (31-39개 묶음상품)
                "거의 없음-매우 낮음-상위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-매우 낮음-중간": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-매우 낮음-하위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-낮음-상위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-낮음-중간": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-낮음-하위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-중간-상위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-중간-중간": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-중간-하위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-높음-상위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-높음-중간": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                "거의 없음-높음-하위": "단일 상품 진입 어려움! 묶음상품 판매나 다른 키워드를 고려해보세요!",
                              // 전혀 없음 (40개 묶음상품)
                "전혀 없음-매우 낮음-상위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-매우 낮음-중간": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-매우 낮음-하위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-낮음-상위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-낮음-중간": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-낮음-하위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-중간-상위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-중간-중간": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-중간-하위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-높음-상위":"단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-높음-중간":"단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
                "전혀 없음-높음-하위": "단일 상품 진입 불가! 모든 상품이 묶음상품입니다. 묶음상품 판매로 쉽게 상위 노출 하는 것을 추천해요!",
            };

            const resultMsg = msgMap[`${bundleOpportunity}-${competitionLevel}-${exposureLevel}`];
             
            if (!resultMsg) return null;



                        return (
              <Card className="border-2 border-green-600 bg-green-50 shadow-md">
                <CardContent className="py-6 text-center space-y-3">
                  <p className="text-base font-semibold">
                     {/* 크기 배지 */}
                     <span
                       className={
                         "px-2 py-0.5 rounded text-xs font-medium mr-1 " +
                         (sizeLabel === "소형 키워드"
                           ? "bg-green-100 text-green-800"
                           : sizeLabel === "중형 키워드"
                           ? "bg-yellow-200 text-yellow-900"
                           : sizeLabel === "대형 키워드"
                           ? "bg-red-200 text-red-800"
                           : "bg-gray-200 text-gray-700")
                       }
                     >
                       {sizeLabel}
                     </span>
                     · 단일상품 판매기회 {bundleOpportunity} · {exposureLevel} 노출 · 경쟁 {competitionLevel}
                   </p>
                  <p className="text-lg font-medium leading-relaxed text-gray-800">{resultMsg}</p>

                  {/* 상품명 최적화 버튼 그룹 */}
                  <div className="flex gap-3 justify-center pt-3">
                  <Link href="/product-optimizer/complete" onClick={(e: any) => handleMenuNavigate(e, "/product-optimizer/complete")}>
                    <Button 
                      variant="default" 
                      size="sm" 
                      className={`px-4 ${productOptimizationLimit?.canUse ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
                      disabled={!productOptimizationLimit?.canUse}
                    >
                      {`완벽 최적화 (${productOptimizationLimit?.currentCount ?? 0}/${productOptimizationLimit?.maxCount ?? 10})`}
                    </Button>
                </Link>
                  <Link href="/product-optimizer/quick" onClick={(e: any) => handleMenuNavigate(e, "/product-optimizer/quick")}>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={`px-4 ${productOptimizationLimit?.canUse ? 'border-green-600 text-green-700 hover:bg-green-50' : 'border-gray-400 text-gray-400 cursor-not-allowed'}`}
                      disabled={!productOptimizationLimit?.canUse}
                    >
                      {`빠른 최적화 (${productOptimizationLimit?.currentCount ?? 0}/${productOptimizationLimit?.maxCount ?? 10})`}
                    </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
            );
          })()}

          {hasKeyword && (statsData || prefillStatsData) && (() => {
            // 입력한 키워드의 월간 검색량만 추출
            const effectiveStats = statsData ?? prefillStatsData!;
            const mainStat = effectiveStats.keywordList.find((k) => k.relKeyword.toLowerCase() === keyword.trim().toLowerCase());
            
            console.log('[Volume Display] Debug info:', {
              keyword: keyword.trim(),
              hasStatsData: !!statsData,
              hasPrefillStatsData: !!prefillStatsData,
              keywordListLength: effectiveStats.keywordList?.length || 0,
              availableKeywords: effectiveStats.keywordList?.map(k => k.relKeyword) || [],
              foundMainStat: !!mainStat,
              mainStat: mainStat
            });
            
            const mainVol = mainStat ? calcKeywordVolume(mainStat) : null;
            
            console.log('[Volume Display] Final calculation:', {
              mainVol: mainVol,
              willShowDash: mainVol === null
            });
            
            const sizeLabel = mainVol === null ? null : mainVol < 5000 ? "소형 키워드" : mainVol < 20000 ? "중형 키워드" : "대형 키워드";

            // If analysis data not ready, show only volume card
            if (!analysisData || !analysisData.products || analysisData.products.length === 0) {
              return (
                <div className="grid md:grid-cols-1 gap-4">
                  <Card className="shadow-sm border rounded-lg h-full flex flex-col">
                    <CardHeader className="bg-gray-50 py-3">
                      <CardTitle className="text-base font-semibold text-gray-800">"{keyword}" 월간 검색량</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col items-center justify-center gap-2">
                      <p className="text-center text-2xl font-bold flex items-center justify-center gap-2">
                        {(() => {
                          const pcLT10 = typeof mainStat?.monthlyPcQcCnt === "string" && (mainStat?.monthlyPcQcCnt as string).includes("<");
                          const mobLT10 = typeof mainStat?.monthlyMobileQcCnt === "string" && (mainStat?.monthlyMobileQcCnt as string).includes("<");
                          
                          console.log('[Volume Display 1] PC/Mobile LT10 check:', {
                            pcLT10,
                            mobLT10,
                            mainStatPc: mainStat?.monthlyPcQcCnt,
                            mainStatMobile: mainStat?.monthlyMobileQcCnt,
                            mainVol,
                            willShowDash: mainVol === null,
                            willShow20Less: pcLT10 && mobLT10
                          });
                          
                          return pcLT10 && mobLT10
                            ? "20회 미만"
                            : mainVol !== null
                              ? `${mainVol.toLocaleString()} 회`
                              : "검색량 정보 없음";
                        })()}
                        {sizeLabel && (
                          <span
                            className={
                              "px-2 py-0.5 rounded text-xs font-medium " +
                              (sizeLabel === "소형 키워드"
                                ? "bg-green-100 text-green-800"
                                : sizeLabel === "중형 키워드"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800")
                            }
                          >
                            {sizeLabel}
                          </span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            }

            // Review stats summary (min/max/avg only)
            const reviewsArr = analysisData.products ? analysisData.products!.map((p: any) => p.rankReviewCount ?? 0).filter((v: number) => v > 0) : (analysisData.productsSummary?.reviewStats ? [analysisData.productsSummary.reviewStats.min, analysisData.productsSummary.reviewStats.mean, analysisData.productsSummary.reviewStats.max] : []);

            const calcStats = (arr: number[]) => {
              if (arr.length === 0) return { min: 0, max: 0, avg: 0 };
              const min = Math.min(...arr);
              const max = Math.max(...arr);
              const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
              return { min, max, avg };
            };

            const reviewStatsRaw = calcStats(reviewsArr);
            const reviewStats = { ...reviewStatsRaw, avg: Math.floor(reviewStatsRaw.avg) };

            const lowReviewProducts = [...analysisData.products!]
              .filter((p: any) => (p.rankReviewCount ?? 0) > 0)
              .sort((a: any, b: any) => (a.rankReviewCount ?? 0) - (b.rankReviewCount ?? 0))
              .slice(0, 3);

            // 묶음상품 분석
            const bundleProducts = (analysisData.products ?? []).filter((p:any)=>p.isBundleProduct);
            const top10BundleProducts = bundleProducts.filter((p: any) => p.rank <= 10);
            const bundleRanks = top10BundleProducts.map((p: any) => p.rank).sort((a, b) => a - b);

            return (
              <div className="grid md:grid-cols-4 gap-4">
                {/* 월간 검색량 */}
                <Card className="shadow-sm border rounded-lg h-full flex flex-col">
                  <CardHeader className="bg-gray-50 py-3 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-800">"{keyword}" 월간 검색량</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col items-center justify-center gap-2">
                    <p className="text-center text-xl font-bold flex items-center justify-center gap-2">
                      {(() => {
                        const pcLT10b = typeof mainStat?.monthlyPcQcCnt === "string" && (mainStat?.monthlyPcQcCnt as string).includes("<");
                        const mobLT10b = typeof mainStat?.monthlyMobileQcCnt === "string" && (mainStat?.monthlyMobileQcCnt as string).includes("<");
                        
                        console.log('[Volume Display 2] PC/Mobile LT10 check:', {
                          pcLT10b,
                          mobLT10b,
                          mainStatPc: mainStat?.monthlyPcQcCnt,
                          mainStatMobile: mainStat?.monthlyMobileQcCnt,
                          mainVol,
                          willShowDash: mainVol === null,
                          willShow20Less: pcLT10b && mobLT10b
                        });
                        
                        return pcLT10b && mobLT10b
                          ? "20회 미만"
                          : mainVol !== null
                            ? `${mainVol.toLocaleString()} 회`
                            : "검색량 정보 없음";
                      })()}
                      {sizeLabel && (
                        <span
                          className={
                            "px-2 py-0.5 rounded text-xs font-medium " +
                            (sizeLabel === "소형 키워드"
                              ? "bg-green-100 text-green-800"
                              : sizeLabel === "중형 키워드"
                              ? "bg-yellow-100 text-yellow-800"
                              : sizeLabel === "대형 키워드"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-700")
                          }
                        >
                          {sizeLabel}
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>

                {/* 카테고리 개수 */}
                <Card className="shadow-sm border rounded-lg h-full flex flex-col">
                  <CardHeader className="bg-gray-50 py-3 pb-2">
                    <div className="flex items-center justify-between w-full">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 cursor-default">
                            <CardTitle className="text-base font-semibold text-gray-800">카테고리</CardTitle>
                            <Info className="w-4 h-4 text-gray-400" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                           1페이지 상품 40개 기준입니다
                        </TooltipContent>
                      </Tooltip>

                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center text-sm space-y-3 py-4">
                    {(() => {
                      // 저장된 카테고리 정보를 우선 사용
                      if (analysisData.categoriesSummary && analysisData.categoriesSummary.length > 0) {
                        const categories = analysisData.categoriesSummary;
                        if (categories.length === 0) return <div className="text-center text-gray-500">카테고리 정보 없음</div>;
                        
                        // {name, count} 형태의 객체 배열인 경우
                        if (categories[0] && typeof categories[0] === 'object' && categories[0].name) {
                          return (
                            <div className="space-y-2">
                              {categories.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-center gap-2 text-sm">
                                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md font-medium text-xs">
                                    {item.name}
                                  </span>
                                  <span className="text-green-700 font-semibold">{Math.round(item.count / 40 * 100)}%</span>
                                  
                                </div>
                              ))}
                            </div>
                          );
                        }
                        
                        // 문자열 배열인 경우
                        return (
                          <div className="space-y-2">
                            {categories.map((cat: string, idx: number) => (
                              <div key={idx} className="flex items-center justify-center">
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md font-medium text-xs">
                                  {cat}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      
                      // analysisData.categories가 {key, value} 객체 배열인 경우 처리
                      if (analysisData.categories && Array.isArray(analysisData.categories)) {
                        const categoryItems = analysisData.categories
                          .filter((cat: any) => cat && (cat.key || cat.category))
                          .sort((a: any, b: any) => (b.value || 0) - (a.value || 0)) // value 기준 내림차순 정렬
                          .map((cat: any) => ({
                            name: cat.key || cat.category || String(cat),
                            count: cat.value || 0
                          }));
                        
                        if (categoryItems.length === 0) return <div className="text-center text-gray-500">카테고리 정보 없음</div>;
                        
                        return (
                          <div className="space-y-2">
                            {categoryItems.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-center gap-2 text-sm">
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md font-medium text-xs">
                                  {item.name}
                                </span>
                                <span className="text-green-700 font-semibold text-base">{Math.round(item.count / 40 * 100)}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      
                      // 기존 로직 (백업용)
                      const categories = analysisData.categories || [];
                      const uniqueCategories = categories.length > 0 ? categories : 
                        (analysisData.products || []).reduce((acc: string[], p: any) => {
                          if (p.category && !acc.includes(p.category)) {
                            acc.push(p.category);
                          }
                          return acc;
                        }, []);
                      
                      if (uniqueCategories.length === 0) return <div className="text-center text-gray-500">카테고리 정보 없음</div>;
                      
                      return (
                        <div className="space-y-2">
                          {uniqueCategories.map((cat: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-center">
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md font-medium text-xs">
                                {typeof cat === 'string' ? cat : JSON.stringify(cat)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* 묶음상품 수 */}
                <Card className="shadow-sm border rounded-lg h-full flex flex-col">
                  <CardHeader className="bg-gray-50 py-3 pb-2">
                    <div className="flex items-center justify-between w-full">
                      <CardTitle className="text-base font-semibold text-gray-800">묶음상품</CardTitle>
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        단일 상품 판매 기회 판단
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col items-center justify-center text-sm space-y-2">
                    <p className="text-center">
                      1페이지(40개)중 묶음 상품 개수: <span className="text-green-700 font-semibold text-base">{bundleProducts.length}개</span>
                    </p>
                    <p className="text-center">
                      상위 10개 중 묶음 상품 개수: <span className="text-green-700 font-semibold text-base">{top10BundleProducts.length}개<br></br></span>
                      {bundleRanks.length > 0 && (
                        <span className="text-green-700 font-semibold text-base"> ({bundleRanks.map(rank => `${rank}위`).join(", ")}) </span>
                      )}
                      
                    </p>
                  </CardContent>
                </Card>

                {/* 리뷰 수 */}
                <Card className="shadow-sm border rounded-lg h-full flex flex-col">
                  <CardHeader className="bg-gray-50 py-3 pb-2">
                    <div className="flex items-center justify-between w-full">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 cursor-default">
                            <CardTitle className="text-base font-semibold text-gray-800">전체 기간 리뷰</CardTitle>
                            <Info className="w-4 h-4 text-gray-400" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          1페이지 상품의 전체 기간 기준입니다. 실제 노출에 영향을 주는 월간 수치는 이보다 훨씬 적을 수 있어요!
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        노출 경쟁력 판단
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col items-center justify-center text-sm space-y-1 mt-4">
                    <span className="text-xs text-gray-600 whitespace-nowrap mb-2">
                      최저 {compactCount(reviewStats.min)} | 평균 {compactCount(reviewStats.avg)} | 최대 {compactCount(reviewStats.max)}
                    </span>
                    {lowReviewProducts.map((p: any, idx: number) => {
                      const prefix = idx === 0
                        ? "리뷰가 가장 적은 상품: "
                        : idx === 1
                        ? "두 번째 리뷰 적은 상품: "
                        : "세 번째 리뷰 적은 상품: ";
                      return (
                        <p key={`grid-rev-${p.rank}`}>{prefix}<span className="text-green-700 font-semibold text-base">{p.rankReviewCount.toLocaleString()}개</span>로 <span className="text-green-700 font-semibold text-base">{formatRank(p.rank)}</span></p>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

        {/* 확장프로그램 분석 요약 */}
          {hasKeyword && analysisData && (
          <Card>
            <CardHeader>
              {isMobile ? (
                <CardTitle className="text-base whitespace-pre-line">경쟁이 높은 키워드는{"\n"}아래 키워드로 시도해보세요!</CardTitle>
              ) : (
                <CardTitle>경쟁이 높은 키워드는 아래 키워드로 시도해보세요!</CardTitle>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
                {/* 메인키워드 연관 키워드 */}
              {analysisData.keywords && (
                <div>
                  {isMobile ? (
                    <h3 className="mb-2 text-xs">싱품명에 자주 쓰인 키워드</h3>
                  ) : (
                    <h3 className="mb-2">현재 페이지 40개 상품명에서 자주 쓰인 키워드</h3>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-2 text-left">키워드</th>
                            <th className="px-4 py-2 text-right">활용 횟수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...analysisData.keywords]
                          .sort((a: any, b: any) => b.value - a.value)
                            .slice(0, 5)
                          .map((k: any) => (
                            <tr key={k.key} className="border-b hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap">{k.key}</td>
                              <td className="px-4 py-2 text-right">{k.value.toLocaleString()}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
        {/* 확인 팝업 */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{targetLabel} 이동</DialogTitle>
            </DialogHeader>
            <p className="text-sm">"{keyword.trim()}" 키워드로 {targetLabel}를 진행하시겠어요?</p>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>취소</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={proceedNavigation}>확인</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 로그인 모달 */}
        <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
          <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none">
            <LoginPage isModal={true} onLoginSuccess={() => {
              setShowLoginModal(false);
              // 모바일 환경에서 로그인 성공 시 PC 전용 모달을 띄움
              if (isMobile) {
                setShowPcOnlyModal(true);
              }
            }} />
          </DialogContent>
        </Dialog>

        {/* 확장프로그램 설치 모달 */}
        <Dialog open={showExtensionModal} onOpenChange={setShowExtensionModal}>
          <DialogContent className="max-w-md bg-white">
            <button
              onClick={() => setShowExtensionModal(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </button>
            <DialogHeader>
              <DialogTitle className="text-center text-xl font-bold text-gray-800 mb-2">확장 프로그램만 설치하면 바로 분석 시작!</DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-4 p-4">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-gray-600">상품 분석을 위해 확장프로그램 설치가 필요해요.<br />설치 후 새로고침만 하면 바로 사용가능해요</p>
              <Button
                onClick={() => {
                  trackEvent('Extension', 'install_click', 'Modal');
                  window.open(CHROME_WEBSTORE_URL, "_blank");
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3"
              >
                <Download className="mr-2 h-4 w-4" />
                설치하기 (클릭 한 번 3초면 끝!)
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* PC 전용 모달 */}
        <PcOnlyModal 
          open={showPcOnlyModal} 
          onOpenChange={setShowPcOnlyModal} 
        />

        {/* 로봇 인증 확인 모달 */}
        <RobotVerificationDialog
          open={showRobotVerificationModal}
          onOpenChange={setShowRobotVerificationModal}
          onConfirm={activateNaverShoppingPage}
        />
      </TooltipProvider>
    </DashboardLayout>
  );
} 