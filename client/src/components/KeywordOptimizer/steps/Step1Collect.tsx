import React, { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Key,
  Hash,
  ChevronLeft,
  ChevronRight,
  FileDigit,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  BookCheck,
  X,
  Download,
  ArrowDown,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import dynamic from "next/dynamic";
import { trackEvent } from "@/lib/analytics";
import { useOptimizer } from "@/contexts/OptimizerContext";
import { useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/components/LoginPage";
import KeywordHistoryComponent from "@/components/KeywordHistory";
import { HistoryService } from "@/lib/historyService";
import { UsageService } from "@/lib/usageService";
import { Link } from "wouter";
import RobotVerificationDialog from "@/components/ui/robot-verification-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { PcOnlyModal } from "@/components/ui/pc-only-modal";

import { CHROME_EXTENSION_ID, CHROME_WEBSTORE_URL } from "@/lib/constants";

interface Step1CollectProps {
  onDone: () => void;
}

// Helper: 한국표준시 날짜
function getKstDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const ReactWordcloud = dynamic(() => import("react-wordcloud"), { 
  ssr: false,
  // React DevTools 경고 무시 (라이브러리 자체 문제)
  loading: () => <div className="w-full h-full flex items-center justify-center">로딩 중...</div>
});

export default function Step1Collect({ onDone }: Step1CollectProps) {
  // 전역 컨텍스트에서 데이터와 키워드 상태를 가져옵니다.
  const {
    analysisData: ctxAnalysisData,
    setAnalysisData: setCtxAnalysisData,
    mainKeyword: ctxMainKeyword,
    setMainKeyword,
    setSynonymGroups,
    setCombResult,
    setSelectedMain,
    setGeneratedProductNames,
    setGeneratedReason,
    setGeneratedTags,
    setGeneratedCategories,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    selectedCategoryIndex: _selectedCategoryIndex,
    setSelectedCategoryIndex,
    setCombMainMap,
    setAllCategoriesData,
  } = useOptimizer();

  // 인증 상태
  const { currentUser } = useAuth();

  // 모바일 체크 및 PC 전용 모달
  const isMobile = useIsMobile();
  const [showPcOnlyModal, setShowPcOnlyModal] = useState(false);

  // 입력값(현재 사용자가 입력 중인 키워드)
  const [productName, setProductName] = useState(ctxMainKeyword ?? "");
  // 실제 분석 결과를 생성한 키워드 → productName 과 다를 경우 이전 결과를 숨기기 위함
  const [analysisKeyword, setAnalysisKeyword] = useState(ctxMainKeyword ?? "");
  // 직전에 분석을 요청한 키워드를 기억하여, 결과 수신 시 정확히 매칭합니다.
  const latestQueryRef = useRef<string>(ctxMainKeyword ?? "");
  const latestPageIndexRef = useRef<number>(1);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(ctxAnalysisData);
  const [categoriesDetailed, setCategoriesDetailed] = useState<any[]>([]);
  const [currentCatIdx, setCurrentCatIdx] = useState(0);
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllKeywordCounts, setShowAllKeywordCounts] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [showAllCatKeywords, setShowAllCatKeywords] = useState(false);
  const [showAllCatKeywordCounts, setShowAllCatKeywordCounts] = useState(false);
  const [showAllCatTags, setShowAllCatTags] = useState(false);
  // 페이지 번호 입력 (문자열로 관리, 빈값 허용)
  const [pageIndex, setPageIndex] = useState<string>("");
  const [pageError, setPageError] = useState<boolean>(false);
  
  // 모달 상태
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [showRobotVerificationModal, setShowRobotVerificationModal] = useState(false);
  const [usageLimitMessage, setUsageLimitMessage] = useState<string | null>(null);

  // 중복 최적화 요청 방지용
  const optimizationInProgressRef = useRef(false);

  // optimizerReset 이벤트 수신 시 로컬 상태 초기화
  useEffect(() => {
    const handler = () => {
      console.log('[Step1Collect] optimizerReset – 로컬 상태 초기화');
      setAnalysisData(null);
      setProductName('');
      setAnalysisKeyword('');
      setCategoriesDetailed([]);
      setPageIndex('');
      setIsOptimizing(false);
      setShowAllKeywords(false);
      setShowAllKeywordCounts(false);
      setShowAllTags(false);
      setShowAllCatKeywords(false);
      setShowAllCatKeywordCounts(false);
      setShowAllCatTags(false);
      optimizationInProgressRef.current = false;
    };
    window.addEventListener('optimizerReset', handler);
    return () => window.removeEventListener('optimizerReset', handler);
  }, []);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    // 예시 데이터 자동 주입 제거됨 - 비로그인 사용자에게는 빈 화면 표시
  }, []);

  // PrefillProvider로 전달된 분석 데이터를 로컬 state에 동기화
  useEffect(() => {
    if (!analysisData && ctxAnalysisData) {
      setAnalysisData(ctxAnalysisData);
      // 키워드 경쟁률 분석에서 온 경우 페이지 인덱스 설정
      if (ctxAnalysisData._pageIndex) {
        setPageIndex(ctxAnalysisData._pageIndex.toString());
        console.log('[Complete Optimizer] 키워드 경쟁률 분석에서 페이지 인덱스 설정:', ctxAnalysisData._pageIndex);
      }
    }
    // Prefill 시 mainKeyword가 들어오면 입력값과 analysisKeyword 동기화
    if (ctxMainKeyword && !productName) {
      // productName이 빈 문자열일 때는 setProductName을 실행하지 않음
      if (ctxMainKeyword !== "") {
        setProductName(ctxMainKeyword);
        setAnalysisKeyword(ctxMainKeyword);
      }
    }
  }, [ctxAnalysisData]);

  // categoriesDetailed 초기화 - analysisData가 있을 때 즉시 설정
  useEffect(() => {
    if (analysisData?.categoriesDetailed && analysisData.categoriesDetailed.length > 0) {
      const sorted = [...analysisData.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
      setCategoriesDetailed(sorted);
      setCurrentCatIdx(0);
      setSelectedCategoryIndex(0);
    }
  }, [analysisData?.categoriesDetailed]);

  // move to next step automatically via button
  const handleNext = () => {
    if (analysisData) {
      // 전체 카테고리가 선택되었는지 확인
      const isAllCategoriesSelected = currentCatIdx === 0 && allCategoriesData;
      
      if (isAllCategoriesSelected) {
        console.log('[Step1] 전체 카테고리가 선택되어 다음 단계로 진행합니다.');
        // 전체 카테고리 데이터를 사용하도록 selectedCategoryIndex를 -1로 설정 (특별한 값)
        setSelectedCategoryIndex(-1);
      }
      
      onDone();
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (event.data.type === "SEO_ANALYSIS_RESULT") {
        // 카테고리 정렬 및 데이터 설정
        const data = event.data.data;
        if (Array.isArray(data.categoriesDetailed)) {
          data.categoriesDetailed = [...data.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
        }
        data._keyword = latestQueryRef.current; // attach keyword for matching
        // 분석 요청 시 저장한 페이지 번호 사용
        data._pageIndex = latestPageIndexRef.current;
        console.log('[Complete Optimizer] Setting page index:', data._pageIndex, 'from latestPageIndexRef.current');
        setAnalysisData(data);
        setCtxAnalysisData(data);
        // 새 결과가 도착하면, 해당 결과를 생성한 키워드로 동기화
        setAnalysisKeyword(latestQueryRef.current);
        setSelectedCategoryIndex(0);
        setIsOptimizing(false);
        // 최적화 흐름 종료 – 중복 호출 플래그 해제
        optimizationInProgressRef.current = false;

        // 분석이 성공적으로 완료되면 사용량 증가
        if (currentUser?.email) {
          (async () => {
            try {
              await UsageService.incrementProductOptimization(currentUser.email!);
              console.log('[Usage] Product optimization usage incremented after successful analysis');
            } catch (error) {
              console.error('[Usage] Failed to increment usage:', error);
            }
          })();
        }

        // 히스토리에 저장 (로그인된 사용자만)
        if (currentUser?.email && latestQueryRef.current) {
          // 분석 데이터에서 실제 사용된 페이지 번호 추출
          const actualPageIndex = data._pageIndex || 1;
          console.log('[Complete Optimizer] Saving step1 data for:', currentUser.email, latestQueryRef.current);
          // 기존 히스토리 컬렉션 저장 (레거시)
          HistoryService.saveHistory(
            currentUser.email,
            latestQueryRef.current,
            'complete-optimizer',
            data,
            actualPageIndex
          ).catch(()=>{});

          // 새로운 월→uid 구조 저장
          HistoryService.saveCompleteProductNameOptimize(
            currentUser.email,
            currentUser.uid,
            latestQueryRef.current,
            {
              currentStep: 1,
              step1Data: data
            },
            actualPageIndex
          ).then(() => {
            console.log('[Complete Optimizer] Step1 data saved');
          }).catch(error => {
            console.error('[Complete Optimizer] Failed to save step1 data:', error);
          });
        } else {
          console.log('[Complete Optimizer] Not saving history - user email:', currentUser?.email, 'keyword:', latestQueryRef.current);
        }
      } else if (event.data.type === "SEO_ANALYSIS_CANCELLED") {
        console.log('[Step1Collect] 분석 취소 수신');
        setIsOptimizing(false);
        optimizationInProgressRef.current = false;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [currentUser]);

  // 확장프로그램 설치 여부 체크 (두 가지 방법으로 확인)
  const checkExtensionInstalled = (): Promise<boolean> => {
    return new Promise((resolve) => {
      let resolved = false;
      
      // 방법 1: postMessage를 통한 확인 (현재 페이지에 content script가 있을 때)
      const messageHandler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        if (event.data.type === "EXTENSION_STATUS" && !resolved) {
          console.log('[Web] 확장프로그램 설치 확인됨 (postMessage):', event.data.installed);
          resolved = true;
          window.removeEventListener("message", messageHandler);
          resolve(event.data.installed === true);
        }
      };

      window.addEventListener("message", messageHandler);
      console.log('[Web] 확장프로그램 설치 확인 요청 전송 (postMessage)');
      window.postMessage({ type: "CHECK_EXTENSION" }, window.location.origin);

      // 방법 2: Chrome Extension API를 통한 직접 확인
      
      if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.runtime && (window as any).chrome.runtime.sendMessage) {
        console.log('[Web] Chrome Extension API를 통한 확인 시도');
        
        try {
          (window as any).chrome.runtime.sendMessage(
            CHROME_EXTENSION_ID,
            { type: "CHECK_EXTENSION_INSTALLED" },
            (response: any) => {
              if (!resolved) {
                if ((window as any).chrome.runtime.lastError) {
                  console.log('[Web] 확장프로그램 설치되지 않음 (Chrome API 오류):', (window as any).chrome.runtime.lastError.message);
                  resolved = true;
                  window.removeEventListener("message", messageHandler);
                  resolve(false);
                } else if (response && response.installed) {
                  console.log('[Web] 확장프로그램 설치 확인됨 (Chrome API):', response);
                  resolved = true;
                  window.removeEventListener("message", messageHandler);
                  resolve(true);
                }
              }
            }
          );
        } catch (error) {
          console.log('[Web] Chrome Extension API 오류:', error);
        }
      }

      // 타임아웃: 500ms 후에도 응답이 없으면 설치되지 않은 것으로 판단
      setTimeout(() => {
        if (!resolved) {
          console.log('[Web] 확장프로그램 설치되지 않음 (타임아웃)');
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

  const handleOptimize = async () => {
    // 이미 요청이 진행 중이면 무시
    if (optimizationInProgressRef.current) return;

    // 모바일 체크 - PC 전용 기능
    if (isMobile) {
      if (!currentUser) {
        setShowLoginModal(true);
        // 로그인 성공 시 PC모달을 띄우기 위해 플래그를 남김
        return;
      } else {
        setShowPcOnlyModal(true);
        return;
      }
    }

    // 최초 진입 시 플래그 설정 (이후 오류가 나면 하단에서 해제)
    optimizationInProgressRef.current = true;

    if (!productName.trim()) {
      // 유효하지 않은 입력 → 플래그 해제 후 리턴
      optimizationInProgressRef.current = false;
      return;
    }

    // pageIndex 유효성 검사
    const pageNum = parseInt(pageIndex, 10);
    if (isNaN(pageNum) || pageNum <= 0) {
      setPageError(true);
      optimizationInProgressRef.current = false;
      return;
    }
    setPageError(false);

    // 로그인 상태 체크
    if (!currentUser) {
      trackEvent('DropOff', 'noLogin', null, {
        optimizerType: 'complete',
        query: productName.trim(),
        pageIndex: pageNum,
      });
      setShowLoginModal(true);
      optimizationInProgressRef.current = false;
      return;
    }

    // 사용량 제한 확인
    try {
      const usageLimit = await UsageService.checkProductOptimizationLimit(currentUser.email!);
      if (!usageLimit.canUse) {
        setUsageLimitMessage(`오늘 상품 최적화 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`);
        optimizationInProgressRef.current = false;
        return;
      }
      setUsageLimitMessage(null);
    } catch (error) {
      console.error('[Usage] Failed to check usage limit:', error);
      // 사용량 확인 실패 시에도 분석 진행
    }

    // 확장프로그램 설치 상태 체크
    const isExtensionInstalled = await checkExtensionInstalled();
    if (!isExtensionInstalled) {
      trackEvent('DropOff', 'noExtension', null, {
        optimizerType: 'complete',
        query: productName.trim(),
        pageIndex: pageNum,
      });
      setShowExtensionModal(true);
      optimizationInProgressRef.current = false;
      return;
    }

    // 분석 시작 전에 현재 입력 키워드를 기억합니다.
    latestQueryRef.current = productName.trim();
    latestPageIndexRef.current = pageNum;
    setIsOptimizing(true);
    trackEvent('Analyze', 'complete_optimize', null, {
      query: productName.trim(),
      pageIndex: pageNum,
    });

            window.postMessage(
          {
            type: "START_SEO_ANALYSIS",
            data: {
              productName: productName,
              pageIndex: pageNum,
              timeoutMs: 0, // 즉시 실행
            },
          },
          "*"
        );

    // 새 query 분석을 시작하므로 이전 2단계/3단계 데이터 초기화
    setSynonymGroups([]);
    setCombResult({});
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleOptimize();
    }
  };

  // 스텝 이동 후 돌아왔을 때 입력창에 이전 키워드를 자동으로 복원
  useEffect(() => {
    if (!productName && ctxMainKeyword) {
      setProductName(ctxMainKeyword);
    }
  }, [ctxMainKeyword]);

  // 캐러셀 이동
  const prevCategory = () => {
    if (extendedCategoriesDetailed.length === 0) return;
    setCurrentCatIdx((prev) => {
      const next = (prev - 1 + extendedCategoriesDetailed.length) % extendedCategoriesDetailed.length;
      // 전체 카테고리가 아닌 경우에만 selectedCategoryIndex 업데이트
      if (next > 0) {
        setSelectedCategoryIndex(next - 1);
      } else {
        setSelectedCategoryIndex(0);
      }
      return next;
    });
  };

  const nextCategory = () => {
    if (extendedCategoriesDetailed.length === 0) return;
    setCurrentCatIdx((prev) => {
      const next = (prev + 1) % extendedCategoriesDetailed.length;
      // 전체 카테고리가 아닌 경우에만 selectedCategoryIndex 업데이트
      if (next > 0) {
        setSelectedCategoryIndex(next - 1);
      } else {
        setSelectedCategoryIndex(0);
      }
      return next;
    });
  };

  // 전체 카테고리 데이터 생성 (모든 카테고리의 집계)
  const allCategoriesData = useMemo(() => {
    if (!analysisData?.categoriesDetailed || analysisData.categoriesDetailed.length === 0) {
      return null;
    }
    
    // 카테고리가 2개 이상일 때만 전체 카테고리 데이터 생성
    if (analysisData.categoriesDetailed.length < 2) {
      return null;
    }

    // 모든 카테고리의 키워드, 태그, 키워드 개수를 집계
    const aggregatedKeywords: Record<string, number> = {};
    const aggregatedTags: Record<string, number> = {};
    const aggregatedKeywordCounts: Record<string, number> = {};
    const aggregatedPairedData: Record<string, any> = {};
    let totalCount = 0;

    analysisData.categoriesDetailed.forEach((cat: any) => {
      totalCount += cat.count || 0;
      
      // 키워드 집계
      if (cat.keywords) {
        Object.entries(cat.keywords).forEach(([key, value]) => {
          aggregatedKeywords[key] = (aggregatedKeywords[key] || 0) + (value as number);
        });
      }
      
      // 태그 집계
      if (cat.tags) {
        Object.entries(cat.tags).forEach(([key, value]) => {
          aggregatedTags[key] = (aggregatedTags[key] || 0) + (value as number);
        });
      }
      
      // 키워드 개수 집계
      if (cat.keywordCounts) {
        Object.entries(cat.keywordCounts).forEach(([key, value]) => {
          aggregatedKeywordCounts[key] = (aggregatedKeywordCounts[key] || 0) + (value as number);
        });
      }

      // ===== pairedData 집계 =====
      if (cat.pairedData && Array.isArray(cat.pairedData)) {
        cat.pairedData.forEach((pair: any) => {
          if (!aggregatedPairedData[pair.attribute]) {
            aggregatedPairedData[pair.attribute] = {
              attribute: pair.attribute,
              characters: [],
            } as any;
          }
          pair.characters.forEach((char: any) => {
            const existing = aggregatedPairedData[pair.attribute].characters.find(
              (c: any) => c.character === char.character
            );
            if (existing) existing.count += char.count;
            else aggregatedPairedData[pair.attribute].characters.push({ ...char });
          });
        });
      }
    });

    const data = {
      categoryPath: "전체 카테고리",
      count: totalCount,
      keywords: aggregatedKeywords,
      tags: aggregatedTags,
      keywordCounts: aggregatedKeywordCounts,
      pairedData: Object.values(aggregatedPairedData).map((pair:any)=>({
        ...pair,
        characters: pair.characters.sort((a:any,b:any)=>b.count-a.count),
      })),
      excludedQuery: analysisData.excludedKeywords?.query || [],
      excludedNumbers: analysisData.excludedKeywords?.numbers || [],
      excludedBrands: analysisData.excludedKeywords?.brands || [],
      excludedTags: analysisData.excludedTags || []
    };

    // Context에 전체 카테고리 데이터 저장
    setAllCategoriesData(data);

    return data;
  }, [analysisData, setAllCategoriesData]);

  // 전체 카테고리를 포함한 확장된 카테고리 목록
  const extendedCategoriesDetailed = useMemo(() => {
    // 카테고리가 2개 이상일 때만 전체 카테고리 포함
    if (!allCategoriesData || categoriesDetailed.length < 2) return categoriesDetailed;
    return [allCategoriesData, ...categoriesDetailed];
  }, [allCategoriesData, categoriesDetailed]);

  // 선택된 카테고리 데이터 (전체 카테고리 포함)
  const currentCategory = extendedCategoriesDetailed.length > 0 ? extendedCategoriesDetailed[currentCatIdx] : null;

  const aggregateCounts = (arr: string[] | undefined) => {
    if (!arr || arr.length === 0) return [] as { key: string; value: number }[];
    const map: Record<string, number> = {};
    arr.forEach((k) => {
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map)
      .map(([k, v]) => ({ key: k, value: v }))
      .sort((a, b) => b.value - a.value);
  };

  const renderExcludedList = (title: string, items: { key: string; value: number }[] | string[]) => (
    <div className="my-2">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <div className="p-2 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
        <div className="flex flex-wrap gap-1">
          {items && items.length > 0 ? (
            items.slice(0, 20).map((it: any, idx: number) => (
              <span 
                key={idx} 
                className="inline-block px-1.5 py-0.5 bg-gray-200 text-xs rounded text-gray-700 select-none pointer-events-none"
                style={{ fontSize: '12px' }}
              >
                {typeof it === "string" ? it : `${it.key}(${it.value}회)`}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400">없음</span>
          )}
        </div>
      </div>
    </div>
  );

  const renderCountList = (title: string, counts: Record<string, number> | undefined) => {
    if (!counts) return null;
    const list = Object.entries(counts)
      .map(([k, v]) => ({ key: k, value: v }))
      .sort((a, b) => Number(a.key) - Number(b.key));
    return renderExcludedList(title, list);
  };

  const renderAttributeTable = () => {
    let pd: any[] = [];
    
    if (currentCategory?.categoryPath === "전체 카테고리") {
      // 전체 카테고리일 때는 모든 카테고리의 pairedData를 집계
      if (analysisData?.categoriesDetailed) {
        const allPairedData: Record<string, any> = {};
        
        analysisData.categoriesDetailed.forEach((cat: any) => {
          if (cat.pairedData) {
            cat.pairedData.forEach((pair: any) => {
              if (!allPairedData[pair.attribute]) {
                allPairedData[pair.attribute] = {
                  attribute: pair.attribute,
                  characters: []
                };
              }
              
              // 특성들을 합치고 빈도수 집계
              pair.characters.forEach((char: any) => {
                const existingChar = allPairedData[pair.attribute].characters.find(
                  (c: any) => c.character === char.character
                );
                if (existingChar) {
                  existingChar.count += char.count;
                } else {
                  allPairedData[pair.attribute].characters.push({ ...char });
                }
              });
            });
          }
        });
        
        // 빈도수 기준으로 정렬
        Object.values(allPairedData).forEach((pair: any) => {
          pair.characters.sort((a: any, b: any) => b.count - a.count);
        });
        
        pd = Object.values(allPairedData);
      }
    } else {
      // 개별 카테고리일 때는 기존 로직 사용
      pd = currentCategory ? currentCategory.pairedData : categoriesDetailed?.[0]?.pairedData || [];
    }
    
    if (!pd || pd.length === 0) return null;
    return (
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-green-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">속성</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">특성</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {pd.slice(0, 20).map((pair: any, idx: number) => (
            <tr key={idx}>
              <td className="px-4 py-2 font-medium">{pair.attribute}</td>
              <td className="px-4 py-2">
                {pair.characters
                  .slice(0, 5)
                  .map((ch: any) => `${ch.character}(${ch.count}회)`)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ===== Helper: 상위 N위 + 동점 포함 =====
  const getTopWithTie = <T,>(sortedArr: T[], limit: number, getValue: (item: T) => number): T[] => {
    if (sortedArr.length <= limit) return sortedArr;
    const threshold = getValue(sortedArr[limit - 1]);
    return sortedArr.filter((item) => getValue(item) >= threshold);
  };

  // ===== Helper: 최소 N개 보장 + 동점 포함 =====
  const getTopWithTieMinimum = <T,>(sortedArr: T[], limit: number, getValue: (item: T) => number): T[] => {
    if (sortedArr.length <= limit) return sortedArr;
    
    // 먼저 상위 limit개를 확실히 가져온다
    const topItems = sortedArr.slice(0, limit);
    
    // limit번째 아이템의 값과 동일한 값을 가진 추가 아이템들을 찾는다
    const thresholdValue = getValue(sortedArr[limit - 1]);
    const additionalTiedItems = sortedArr.slice(limit).filter((item) => getValue(item) === thresholdValue);
    
    return [...topItems, ...additionalTiedItems];
  };

  // ===== 전체(카테고리 없을 때) 키워드 / 태그 상위 12위 + 동점 =====
  const sortedKeywords = useMemo(() => {
    if (!analysisData?.keywords) return [] as any[];
    return [...analysisData.keywords].sort((a: any, b: any) =>
      b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value
    );
  }, [analysisData?.keywords]);

  // 키워드는 빈도 제한 없이 최소 12개 보장
  const topKeywordsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedKeywords, 12, (k: any) => k.value),
    [sortedKeywords]
  );

  const sortedTagsAll = useMemo(() => {
    if (!analysisData?.tags) return [] as any[];
    return [...analysisData.tags].sort((a: any, b: any) =>
      b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value
    );
  }, [analysisData?.tags]);

  // 태그는 빈도 제한 없이 최소 12개 보장
  const topTagsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedTagsAll, 12, (t: any) => t.value),
    [sortedTagsAll]
  );

  // ===== 마지막 12위 인덱스 =====
  const lastTieIdxKeyword = topKeywordsWithTies.length - 1;
  const lastTieIdxTag = topTagsWithTies.length - 1;

  // ===== 전체 키워드 개수 상위 12위 + 동점 =====
  const sortedAllKeywordCounts = useMemo(() => {
    if (!analysisData?.keywordCounts) return [] as any[];
    return [...analysisData.keywordCounts].sort((a: any, b: any) =>
      b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value
    );
  }, [analysisData?.keywordCounts]);

  const topKeywordCountsWithTies = useMemo(
    () =>
      getTopWithTie(sortedAllKeywordCounts, 12, (k: any) => k.value),
    [sortedAllKeywordCounts]
  );

  const lastTieIdxKeywordCount = topKeywordCountsWithTies.length - 1;

  // ===== 카테고리별 상위 12위 + 동점 =====
  const sortedCatKeywordCounts = useMemo(() => {
    if (!currentCategory) return [] as [string, number][];
    return [...Object.entries(currentCategory.keywordCounts)].sort((a: any, b: any) =>
      b[1] === a[1] ? Number(b[0]) - Number(a[0]) : (b[1] as number) - (a[1] as number)
    );
  }, [currentCategory]);

  const topCatKeywordCountsWithTies = useMemo(() => getTopWithTie(sortedCatKeywordCounts, 12, (it) => it[1] as number), [sortedCatKeywordCounts]);

  const sortedCatTags = useMemo(() => {
    if (!currentCategory) return [] as [string, number][];
    return [...Object.entries(currentCategory.tags || {})].sort((a: any, b: any) =>
      (b[1] as number) === (a[1] as number) ? (b[0] as string).localeCompare(a[0] as string) : (b[1] as number) - (a[1] as number)
    );
  }, [currentCategory]);

  // 카테고리별 태그는 빈도 제한 없이 최소 12개 보장
  const topCatTagsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedCatTags, 12, (it) => it[1] as number),
    [sortedCatTags]
  );

  const sortedCatKeywords = useMemo(() => {
    if (!currentCategory) return [] as [string, number][];
    return [...Object.entries(currentCategory.keywords)].sort((a: any, b: any) =>
      (b[1] as number) === (a[1] as number) ? (b[0] as string).localeCompare(a[0] as string) : (b[1] as number) - (a[1] as number)
    );
  }, [currentCategory]);

  // 카테고리별 키워드는 빈도 제한 없이 최소 12개 보장
  const topCatKeywordsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedCatKeywords, 12, (it) => it[1] as number),
    [sortedCatKeywords]
  );

  const lastTieIdxCatKeyword = topCatKeywordsWithTies.length - 1;
  const lastTieIdxCatKC = topCatKeywordCountsWithTies.length - 1;
  const lastTieIdxCatTag = topCatTagsWithTies.length -1;



  // 스크롤 유도 상태 추가
  const [showScrollHint, setShowScrollHint] = useState(false);
  const nextStepButtonRef = useRef<HTMLDivElement>(null);

  // 분석 데이터가 업데이트될 때 스크롤 힌트 바로 표시 (PC에서만)
  useEffect(() => {
    if (analysisData && productName.trim() === analysisKeyword && !isMobile) {
      setShowScrollHint(true);
    } else {
      setShowScrollHint(false);
    }
  }, [analysisData, productName, analysisKeyword, isMobile]);

  // 다음 단계 버튼이 화면에 보일 때 힌트 숨김 (Intersection Observer 사용)
  useEffect(() => {
    if (!nextStepButtonRef.current || !showScrollHint) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShowScrollHint(false);
          }
        });
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.1, // 10% 보이면 감지
      }
    );

    observer.observe(nextStepButtonRef.current);

    return () => {
      observer.disconnect();
    };
  }, [showScrollHint]);

  // 스크롤 유도 컴포넌트
  const ScrollHintComponent = () => (
    <div className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-500 ${
      showScrollHint ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
    }`}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-full shadow-xl border-2 border-blue-400 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="animate-bounce">
            <ArrowDown className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold">📊 분석완료! 아래에 다음단계 버튼을 클릭하세요!</span>
          <div className="animate-bounce">
            <ArrowDown className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-none px-0 space-y-10">
      {/* 단계 설명 */}
      {/* <h2 className="text-2xl font-bold text-center">1단계 – 상위 노출 상품 분석으로 핵심 키워드·태그 파악</h2> */}
      
      {/* 사용 안내 말풍성 - 분석 데이터나 결과가 없을 때만 표시 */}
      {!analysisData && (!ctxAnalysisData || Object.keys(ctxAnalysisData).length === 0) && (
        <div className="max-w-2xl mx-auto mb-6 relative">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl p-4 shadow-md relative">
            <div className="flex items-start gap-3">
              <div className="bg-blue-500 rounded-full p-1.5 flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-800 mb-1">언제 사용하면 좋을까요?</p>
                <p className="text-sm text-blue-700 leading-relaxed mb-1">
                  <span className="font-semibold">네이버 검색 로직을 반영하는 키워드 분석으로 완벽한 상품명</span> 필요할 때 사용!
                  <br/>실제 상위 키워드, <span className="font-semibold">네이버 검색 로직, 네이버 SEO를 모두 고려</span>한 상품명을 만들어요.
                </p>
              </div>
            </div>
            {/* 말풍성 꼬리 */}
            <div className="absolute left-8 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-blue-200"></div>
            <div className="absolute left-8 -bottom-1.5 w-0 h-0 border-l-7 border-r-7 border-t-7 border-l-transparent border-r-transparent border-t-blue-100"></div>
          </div>
        </div>
      )}
      
      {/* 기존 내용 시작 */}
      
      {/* 검색 섹션 */}
      <div className="flex flex-col sm:flex-row gap-6">
        {/* 페이지 번호 카드 */}
        <Card className="border-2 border-blue-100 shadow-md w-full sm:w-52">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-xl">
         
              <FileDigit className="h-5 w-5 text-blue-600" />
              <span>노출 페이지</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="상품 노출 페이지(예:1)"
              value={pageIndex}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setPageIndex(raw);
                if (pageError) setPageError(false);
              }}
              onKeyDown={handleKeyPress}
              className="text-lg py-6 border-2 border-gray-200 focus:border-blue-400 transition-colors"
            />
               <p className="text-sm text-gray-500 mt-4">* 해당 페이지를 분석합니다</p>
            {pageError && (
         <p className="text-sm font-bold italic text-red-500 mt-1">
                페이지 숫자를 입력해주세요.</p>
            )}
          </CardContent>
        </Card>

        {/* 메인 키워드 카드 */}
        <Card className="border-2 border-blue-100 shadow-lg flex-1">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-xl">
              <Search className={isMobile ? "h-4 w-4 text-blue-600" : "h-5 w-5 text-blue-600"} />
              <span>상품 메인 키워드 입력</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={isMobile ? "flex flex-row gap-2 items-center" : "flex flex-row gap-4 items-center"}>
              <Input
                placeholder="최적화할 상품의 메인 키워드를 입력하세요 (예: 고구마, 모자)"
                value={productName}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductName(val);
                  setMainKeyword(val);
                  if (val !== analysisKeyword) {
                    setAnalysisData(undefined);
                    setCtxAnalysisData(undefined as any);
                    setCategoriesDetailed([]);
                    setAnalysisKeyword("");
                    setCurrentCatIdx(0);
                    setSelectedCategoryIndex(0);
                  }
                  if (val === "") {
                    setAnalysisData(undefined);
                    setCtxAnalysisData(undefined as any);
                    setCategoriesDetailed([]);
                  }
                }}
                onKeyDown={handleKeyPress}
                className={isMobile ? "flex-1 w-full min-w-0 text-sm py-3 border-2 border-gray-200 focus:border-blue-400 transition-colors" : "flex-1 w-full min-w-0 text-lg py-6 border-2 border-gray-200 focus:border-blue-400 transition-colors"}
                onFocus={() => {
                  // 예시 데이터 자동 제거 로직 삭제됨
                }}
              />
              <Button
                onClick={handleOptimize}
                disabled={!productName.trim() || isOptimizing}
                className={isMobile ? "px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm border-2 border-blue-600" : "px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold border-2 border-blue-600"}
              >
                {isOptimizing ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>분석 중...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>정보 수집</span>
                  </div>
                )}
              </Button>
            </div>
            <p className="text-sm text-gray-500">* 해당 키워드의 실시간 상위노출 상품을 분석합니다.</p>
          </CardContent>
        </Card>

      </div>

      {/* 사용량 제한 메시지 */}
      {usageLimitMessage && (
        <div className="max-w-4xl mx-auto">
          <Card className="border-2 border-red-200 bg-red-50 shadow-sm">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-red-700">{usageLimitMessage}</p>
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



      {/* 히스토리 컨테이너 (고정 높이로 레이아웃 안정성 확보) */}
      <div className="max-w-4xl mx-auto mt-6" style={{ minHeight: currentUser && !productName.trim() ? 'auto' : '0px' }}>
        {currentUser && !productName.trim() && (
          <KeywordHistoryComponent
            type="complete-optimizer"
            onKeywordSelect={(selectedKeyword, data, aiResult, historyItem) => {
              setProductName(selectedKeyword);
              setMainKeyword(selectedKeyword);
              
              // 페이지 번호 복원
              if (historyItem?.pageIndex) {
                setPageIndex(historyItem.pageIndex.toString());
              }
              
              if (data) {
                setAnalysisData(data);
                setCtxAnalysisData(data);
                setAnalysisKeyword(selectedKeyword);
                if (data.categoriesDetailed) {
                  const sorted = [...data.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
                  setCategoriesDetailed(sorted);
                  setCurrentCatIdx(0);
                  setSelectedCategoryIndex(0);
                }
              }
              
              // 완벽한 상품명 최적화 히스토리 데이터가 있으면 직접 Context에 복원
              if (historyItem?.completeOptimizerData) {
                try {
                  const { step2Data, step3Data } = historyItem.completeOptimizerData;
                  
                  console.log("[Step1] 완벽한 상품명 최적화 히스토리 데이터를 직접 복원:", historyItem.completeOptimizerData);
                  
                  // Context에 직접 복원
                  if (step2Data) {
                    setSynonymGroups(step2Data.synonymGroups || []);
                    setCombResult(step2Data.combResult || {});
                    setSelectedMain(step2Data.selectedMain || selectedKeyword);
                    if((step2Data as any).combMainMap){
                      setCombMainMap((step2Data as any).combMainMap);
                    }
                    console.log("[Step1] 2단계 데이터 복원:", step2Data);
                  }
                  
                  if (step3Data) {
                    setGeneratedProductNames(step3Data.productNames || []);
                    setGeneratedReason(step3Data.reason || "");
                    setGeneratedTags(step3Data.tags || []);
                    setGeneratedCategories(step3Data.categories || []);
                    console.log("[Step1] 3단계 데이터 복원:", step3Data);
                  }
                  
                  // localStorage에도 저장 (새로고침 시 복원용)
                  const cacheData = {
                    keyword: selectedKeyword,
                    data: data,
                    completeOptimizerData: historyItem.completeOptimizerData
                  };
                  localStorage.setItem("latestKeywordAnalysis", JSON.stringify(cacheData));
                  sessionStorage.setItem("allowPrefill", "1");
                  
                  // 적절한 단계로 이동하기 위해 커스텀 이벤트 발생
                  setTimeout(() => {
                    const targetStep = historyItem.completeOptimizerData?.currentStep || 1;
                    console.log(`[Step1] ${targetStep}단계로 이동 트리거`);
                    
                    // 커스텀 이벤트로 단계 이동 요청
                    window.dispatchEvent(new CustomEvent('historyStepRestore', { 
                      detail: { targetStep } 
                    }));
                  }, 100);
                  
                } catch (error) {
                  console.error("[Step1] 히스토리 복원 실패:", error);
                }
              }
            }}
          />
        )}
      </div>

      {/* 결과 및 시각화 섹션 */}
      {analysisData && productName.trim() === analysisKeyword && (
        <>
          <div className="space-y-8 w-full">
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">
              분석 결과
            </h2>

            {/* 스크롤 유도 힌트 추가 */}
            <ScrollHintComponent />

            {/* 카테고리 캐러셀 */}
            {extendedCategoriesDetailed.length > 0 && (
              <div className="flex items-center justify-center gap-4 mb-6">
                <button
                  onClick={prevCategory}
                  className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="text-lg font-semibold">
                  {currentCategory.categoryPath}
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm font-medium ml-2">
                    {currentCategory.count}개
                  </span>
                  <span className="text-blue-600 ml-2">
                    ({currentCatIdx + 1}/{extendedCategoriesDetailed.length})
                  </span>
                </div>
                <button
                  onClick={nextCategory}
                  className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 justify-center mx-auto w-full">


                                            {/* 키워드 (전체) */}
              {(!currentCategory || currentCategory.categoryPath === "전체 카테고리") && analysisData.keywords && (
                  <Card className="flex-1 min-w-0 w-full">
                    <CardHeader>
                      <CardTitle>
                        <span className="flex items-center gap-2">
                          <Key className="text-indigo-500" /> 키워드
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-sm font-medium">
                            {analysisData.keywords.reduce((acc: number, k: any) => acc + (k.value || 0), 0)}개
                          </span>
                        </span>
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
                        <ReactWordcloud
                          words={topKeywordsWithTies.map((c: any) => ({
                            text: c.key,
                            value: c.value,
                          }))}
                          options={{
                            fontSizes: [12, 45],
                            rotations: 2,
                            rotationAngles: [0, 0],
                            deterministic: true,
                            colors: [
                              "#a5b4fc",
                              "#fbcfe8",
                              "#f9a8d4",
                              "#fcd34d",
                              "#bae6fd",
                              "#bbf7d0",
                              "#fca5a5",
                              "#fdba74",
                            ],
                            enableTooltip: true,
                            scale: "sqrt",
                            spiral: "archimedean",
                            padding: 8,
                            transitionDuration: 0,
                          }}
                        />
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-indigo-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                순위
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                키워드
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                빈도
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {(showAllKeywords ? sortedKeywords : topKeywordsWithTies).map((c: any, idx: number) => (
                              <React.Fragment key={`keyword-${idx}`}>
                                <tr>
                                  <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxKeyword ? 12 : idx + 1)}</span></td>
                                  <td className="px-4 py-2">{c.key}</td>
                                  <td className="px-4 py-2">{c.value}</td>
                                </tr>
                                {showAllKeywords && idx === lastTieIdxKeyword && (
                                  <tr key="collapse-keywords-top">
                                    <td colSpan={3} className="px-4 py-2">
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => setShowAllKeywords(false)}
                                          className="text-blue-500 text-xs flex items-center gap-1"
                                        >
                                          접기 <ChevronUp className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => setShowAllKeywords(!showAllKeywords)}
                            className="text-blue-500 text-xs flex items-center gap-1"
                          >
                            {showAllKeywords ? (
                              <>
                                접기 <ChevronUp className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                더보기 <ChevronDown className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </div>
                        {/* 제외 키워드 */}
                        {renderExcludedList("입력 키워드와 동일 키워드", analysisData.excludedKeywords?.query || [])}
                        {renderExcludedList("제외된 숫자 키워드", analysisData.excludedKeywords?.numbers || [])}
                        {renderExcludedList("제외된 브랜드 키워드", analysisData.excludedKeywords?.brands || [])}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 키워드 개수 (전체) */}
                {(!currentCategory || currentCategory.categoryPath === "전체 카테고리") && analysisData.keywords && (
                  <Card className="flex-1 min-w-0 w-full">
                    <CardHeader>
                      <CardTitle>
                        <span className="flex items-center gap-2">
                          <ListOrdered className="text-yellow-500" /> 키워드 개수
                          <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-sm font-medium">
                            {sortedAllKeywordCounts.reduce((acc: number, k: any) => acc + (k.value || 0), 0)}개
                          </span>
                        </span>
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* 키워드 개수 Wordcloud */}
                      <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
                        <ReactWordcloud
                          words={topKeywordCountsWithTies.map((c: any) => ({ text:`${c.key}개`, value: c.value }))}
                          options={{
                            fontSizes: [12, 45],
                            rotations: 2,
                            rotationAngles: [0, 0],
                            deterministic: true,
                            colors: [
                              "#fdba74",
                              "#bbf7d0",
                              "#bae6fd",
                              "#fcd34d",
                              "#a5b4fc",
                              "#fca5a5",
                              "#fbcfe8",
                            ],
                            enableTooltip: true,
                            scale: "sqrt",
                            spiral: "archimedean",
                            padding: 8,
                            transitionDuration: 0,
                          }}
                        />
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-yellow-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                순위
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                키워드수
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                빈도
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {(showAllKeywordCounts ? sortedAllKeywordCounts : topKeywordCountsWithTies).map((c: any, idx: number) => (
                              <React.Fragment key={`keyword-count-${idx}`}>
                                <tr>
                                  <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxKeywordCount ? 12 : idx + 1)}</span></td>
                                  <td className="px-4 py-2">{c.key}</td>
                                  <td className="px-4 py-2">{c.value}</td>
                                </tr>
                                {showAllKeywordCounts && idx === lastTieIdxKeywordCount && (
                                  <tr key="collapse-keyword-counts-top">
                                    <td colSpan={3} className="px-4 py-2">
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => setShowAllKeywordCounts(false)}
                                          className="text-yellow-600 text-xs flex items-center gap-1"
                                        >
                                          접기 <ChevronUp className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => setShowAllKeywordCounts(!showAllKeywordCounts)}
                            className="text-yellow-600 text-xs flex items-center gap-1"
                          >
                            {showAllKeywordCounts ? (
                              <>
                                접기 <ChevronUp className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                더보기 <ChevronDown className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* 태그 (전체) */}
              {(!currentCategory || currentCategory.categoryPath === "전체 카테고리") && analysisData.tags && (
                <Card className="flex-1 min-w-0 w-full">
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <Hash className="text-pink-500" /> 태그
                        <span className="bg-pink-100 text-pink-700 px-2 py-1 rounded-full text-sm font-medium">
                          {analysisData.tags.reduce((acc:number, t:any)=>acc+(t.value||0),0)}개
                        </span>
                      </span>
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
                      <ReactWordcloud
                        words={topTagsWithTies.map((c:any)=>({ text:c.key, value:c.value }))}
                        options={{
                          fontSizes:[12,45],
                          rotations:2,
                          rotationAngles:[0,0],
                          deterministic:true,
                          colors:[
                            "#fbcfe8",
                            "#f9a8d4",
                            "#fca5a5",
                            "#a5b4fc",
                            "#bae6fd",
                            "#bbf7d0",
                            "#fdba74",
                            "#fcd34d",
                          ],
                          enableTooltip:true,
                          scale:"sqrt",
                          spiral:"archimedean",
                          padding:8,
                          transitionDuration:0,
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-pink-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">태그</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {(showAllTags ? sortedTagsAll : topTagsWithTies).map((c:any,idx:number)=>(
                            <React.Fragment key={`tag-${idx}`}>
                              <tr>
                                <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxTag ? 12 : idx + 1)}</span></td>
                                <td className="px-4 py-2 truncate max-w-xs">{c.key}</td>
                                <td className="px-4 py-2">{c.value}</td>
                              </tr>
                              {showAllTags && idx=== lastTieIdxTag && (
                                <tr key="collapse-tags-top">
                                  <td colSpan={3} className="px-4 py-2">
                                    <div className="flex justify-end">
                                      <button onClick={()=>setShowAllTags(false)} className="text-pink-500 text-xs flex items-center gap-1">
                                        접기 <ChevronUp className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end mt-2">
                        <button onClick={()=>setShowAllTags(!showAllTags)} className="text-pink-500 text-xs flex items-center gap-1">
                          {showAllTags ? (
                            <>
                              접기 <ChevronUp className="w-3 h-3" />
                            </>
                          ):(
                            <>
                              더보기 <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                      {/* 제외 태그 */}
                      {renderExcludedList("제외된 태그", analysisData.excludedTags || [])}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 카테고리 키워드 (currentCategory) */}
              {currentCategory && currentCategory.categoryPath !== "전체 카테고리" && (
                <Card className="flex-1 min-w-0 w-full">
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <Key className="text-indigo-500" /> 키워드
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-sm font-medium">
                          {Object.values(currentCategory.keywords).reduce((acc:number, v:any)=>acc+(v as number),0)}개
                        </span>
                      </span>
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
                      <ReactWordcloud
                        words={topCatKeywordsWithTies.map(([k,v]:any)=>({ text:k, value:v as number }))}
                        options={{
                          fontSizes: [12, 45],
                          rotations: 2,
                          rotationAngles: [0, 0],
                          deterministic: true,
                          colors: [
                            "#a5b4fc",
                            "#fbcfe8",
                            "#f9a8d4",
                            "#fcd34d",
                            "#bae6fd",
                            "#bbf7d0",
                            "#fca5a5",
                            "#fdba74",
                          ],
                          enableTooltip: true,
                          scale: "sqrt",
                          spiral: "archimedean",
                          padding: 8,
                          transitionDuration: 0,
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-indigo-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              순위
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              키워드
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              빈도
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {(showAllCatKeywords ? sortedCatKeywords : topCatKeywordsWithTies).map(([k, v]: any, idx: number) => (
                            <React.Fragment key={`cat-keyword-${idx}`}>
                              <tr>
                                <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxCatKeyword ? 12 : idx + 1)}</span></td>
                                <td className="px-4 py-2">{k}</td>
                                <td className="px-4 py-2">{v as number}</td>
                              </tr>
                              {showAllCatKeywords && idx === lastTieIdxCatKeyword && (
                                <tr key="collapse-cat-keywords-top">
                                  <td colSpan={3} className="px-4 py-2">
                                    <div className="flex justify-end">
                                      <button
                                        onClick={() => setShowAllCatKeywords(false)}
                                        className="text-blue-500 text-xs flex items-center gap-1"
                                      >
                                        접기 <ChevronUp className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => setShowAllCatKeywords(!showAllCatKeywords)}
                          className="text-blue-500 text-xs flex items-center gap-1"
                        >
                          {showAllCatKeywords ? (
                            <>
                              접기 <ChevronUp className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              더보기 <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                      {/* 카테고리별 제외 키워드 */}
                      {renderExcludedList("입력 키워드와 동일 키워드", aggregateCounts(currentCategory.excludedQuery))}
                      {renderExcludedList("제외된 숫자 키워드", aggregateCounts(currentCategory.excludedNumbers))}
                      {renderExcludedList("제외된 브랜드 키워드", aggregateCounts(currentCategory.excludedBrands))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 카테고리 키워드 개수 Wordcloud (currentCategory) */}
              {currentCategory && currentCategory.categoryPath !== "전체 카테고리" && (
                <Card className="flex-1 min-w-0 w-full">
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <ListOrdered className="text-yellow-500" /> 키워드 개수
                        <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-sm font-medium">
                          {Object.values(currentCategory.keywordCounts).reduce((acc: number, v: any) => acc + (v as number), 0)}개
                        </span>
                      </span>
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* 키워드 개수 Wordcloud */}
                    <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
                      <ReactWordcloud
                        words={topCatKeywordCountsWithTies.map(([k,v]: any) => ({ text:`${k}개`, value: v as number }))}
                        options={{
                          fontSizes: [12, 45],
                          rotations: 2,
                          rotationAngles: [0, 0],
                          deterministic: true,
                          colors: [
                            "#fdba74",
                            "#bbf7d0",
                            "#bae6fd",
                            "#fcd34d",
                            "#a5b4fc",
                            "#fca5a5",
                            "#fbcfe8",
                          ],
                          enableTooltip: true,
                          scale: "sqrt",
                          spiral: "archimedean",
                          padding: 8,
                          transitionDuration: 0,
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-yellow-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              순위
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              키워드수
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              빈도
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {(showAllCatKeywordCounts ? sortedCatKeywordCounts : topCatKeywordCountsWithTies).map(([k, v]: any, idx: number) => (
                            <React.Fragment key={`cat-kcnt-${idx}`}>
                              <tr>
                                <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxCatKC ? 12 : idx + 1)}</span></td>
                                <td className="px-4 py-2">{k}</td>
                                <td className="px-4 py-2">{v as number}</td>
                              </tr>
                              {showAllCatKeywordCounts && idx === lastTieIdxCatKC && (
                                <tr key="collapse-cat-kcnt-top">
                                  <td colSpan={3} className="px-4 py-2">
                                    <div className="flex justify-end">
                                      <button
                                        onClick={() => setShowAllCatKeywordCounts(false)}
                                        className="text-yellow-600 text-xs flex items-center gap-1"
                                      >
                                        접기 <ChevronUp className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => setShowAllCatKeywordCounts(!showAllCatKeywordCounts)}
                          className="text-yellow-600 text-xs flex items-center gap-1"
                        >
                          {showAllCatKeywordCounts ? (
                            <>
                              접기 <ChevronUp className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              더보기 <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                      {/* 카테고리별 제외 키워드 개수 */}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 카테고리 태그 (currentCategory) */}
              {currentCategory && currentCategory.categoryPath !== "전체 카테고리" && (
                <Card className="flex-1 min-w-0 w-full">
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <Hash className="text-pink-500" /> 태그
                        <span className="bg-pink-100 text-pink-700 px-2 py-1 rounded-full text-sm font-medium">
                          {Object.values(currentCategory.tags || {}).reduce((acc:number,v:any)=>acc+(v as number),0)}개
                        </span>
                      </span>
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height:260 }}>
                      <ReactWordcloud
                        words={topCatTagsWithTies.map(([k,v]:any)=>({ text:k, value:v as number }))}
                        options={{
                          fontSizes:[12,45],
                          rotations:2,
                          rotationAngles:[0,0],
                          deterministic:true,
                          colors:[
                            "#fbcfe8",
                            "#f9a8d4",
                            "#fca5a5",
                            "#a5b4fc",
                            "#bae6fd",
                            "#bbf7d0",
                            "#fdba74",
                            "#fcd34d",
                          ],
                          enableTooltip:true,
                          scale:"sqrt",
                          spiral:"archimedean",
                          padding:8,
                          transitionDuration:0,
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-pink-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">태그</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {(showAllCatTags ? sortedCatTags : topCatTagsWithTies).map(([k,v]:any,idx:number)=>(
                            <React.Fragment key={`cat-tag-${idx}`}>
                              <tr>
                                <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxCatTag ? 12 : idx + 1)}</span></td>
                                <td className="px-4 py-2">{k}</td>
                                <td className="px-4 py-2">{v as number}</td>
                              </tr>
                              {showAllCatTags && idx=== lastTieIdxCatTag && (
                                <tr key="collapse-cat-tags-top">
                                  <td colSpan={3} className="px-4 py-2">
                                    <div className="flex justify-end">
                                      <button onClick={()=>setShowAllCatTags(false)} className="text-pink-500 text-xs flex items-center gap-1">
                                        접기 <ChevronUp className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end mt-2">
                        <button onClick={()=>setShowAllCatTags(!showAllCatTags)} className="text-pink-500 text-xs flex items-center gap-1">
                          {showAllCatTags ? (
                            <>
                              접기 <ChevronUp className="w-3 h-3" />
                            </>
                          ):(
                            <>
                              더보기 <ChevronDown className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                      {/* 카테고리별 제외 태그 */}
                      {renderExcludedList("제외된 태그", aggregateCounts(currentCategory.excludedTags))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* grid 종료 */}
              </div>

              {/* 속성 테이블 */}
              {renderAttributeTable() && (
                <Card className="mt-8 border border-green-100">
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2">
                        <BookCheck className="text-green-500" /> 상품 주요정보
                      </span>
                    </CardTitle>
                    <p className="text-sm text-gray-500">검색 노출에 도움! 상품 등록 시 참고하세요.</p>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {renderAttributeTable()}
                  </CardContent>
                </Card>
              )}

              {/* 다음 단계 버튼 */}
              <div ref={nextStepButtonRef} className="flex flex-col items-center mt-8">
                <Button className="px-6" onClick={handleNext}>
                  다음 단계로
                </Button>
              </div>
            </div>
          </>
        )}

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
              <DialogTitle className="text-center text-xl font-bold text-gray-800 mb-2">
                확장 프로그램만 설치하면 바로 분석 시작!
              </DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-4 p-4">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-gray-600">
                상품 분석을 위해 확장프로그램 설치가 필요해요.<br />
                설치 후 새로고침만 하면 바로 사용가능해요
              </p>
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
      </div>
    );
  }