import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOptimizer } from "@/contexts/OptimizerContext";
import { useAuth } from "@/contexts/AuthContext";
import { HistoryService } from "@/lib/historyService";
import { Tag, ListOrdered, Layers, Hash, Sparkles, Target, BookCheck, ChevronDown, ChevronUp, Search, FileDigit, X, Download, ChevronLeft, ChevronRight, Key, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import LoginPage from "@/components/LoginPage";
import KeywordHistoryComponent from "@/components/KeywordHistory";
import dynamic from "next/dynamic";
import { UsageService } from "@/lib/usageService";
import RobotVerificationDialog from "@/components/ui/robot-verification-dialog";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { CHROME_EXTENSION_ID, CHROME_WEBSTORE_URL } from "@/lib/constants";

// react-wordcloud (CSR only)
const ReactWordcloud = dynamic(() => import("react-wordcloud"), { ssr: false });

interface Step3GenerateProps {
  onPrev: () => void;
  onDone?: () => void; // 다음 단계로 이동을 위해 추가
}

// ===== 내부 타입 정의 =====
interface ContributorInfo { kw: string; count: number; }
interface DisplayKeywordInfo {
  label: string;
  type: 'synonym' | 'indep' | 'comb' | 'normal'; // 주 표시용 (이전 호환)
  types: Set<'synonym' | 'indep' | 'comb' | 'normal'>;      // 복수 타입 지원
  count: number;
  contributors: ContributorInfo[];
}

// Helper: 한국표준시 날짜
function getKstDate() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function Step3Generate({ onPrev, onDone }: Step3GenerateProps) {
  const { 
    analysisData: ctxAnalysisData, 
    setAnalysisData: setCtxAnalysisData,
    synonymGroups, 
    combResult, 
    mainKeyword: ctxMainKeyword,
    setMainKeyword,
    selectedMain, 
    selectedCategoryIndex,
    combMainMap,
    generatedProductNames,
    setGeneratedProductNames,
    generatedReason,
    setGeneratedReason,
    generatedTags,
    setGeneratedTags,
    generatedCategories,
    setGeneratedCategories,
    setSynonymGroups,
    setCombResult,
    setSelectedMain,
    setSelectedCategoryIndex,
    setCombMainMap,
    allCategoriesData,
  } = useOptimizer();
  const { currentUser } = useAuth();
  const isMobile = useIsMobile();

  // ===== 새로운 분석을 위한 상태 (Step1에서 가져온 것들) =====
  const [productName, setProductName] = useState(ctxMainKeyword ?? "");
  const [analysisKeyword, setAnalysisKeyword] = useState(ctxMainKeyword ?? "");
  const latestQueryRef = useRef<string>(ctxMainKeyword ?? "");
  const latestPageIndexRef = useRef<number>(1);
  const [isOptimizing, setIsOptimizing] = useState(false);
  // 비로그인 사용자일 때 예시 데이터를 보여주기 위해 기본값 1 설정
  const [pageIndex, setPageIndex] = useState<string>(currentUser ? "1" : "1");
  const [pageError, setPageError] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [showRobotVerificationModal, setShowRobotVerificationModal] = useState(false);
  const optimizationInProgressRef = useRef(false);
  // 사용량 제한 메시지
  const [usageLimitMessage, setUsageLimitMessage] = useState<string | null>(null);

  // 기존 분석 데이터 상태
  const [analysisData, setAnalysisData] = useState<any>(ctxAnalysisData);
  
  const [currentCatIdx, setCurrentCatIdx] = useState(() => {
    return (selectedCategoryIndex ?? 0);
  });
  // ==== 카테고리별 데이터 준비 ====
  // Step1, Step2와 동일한 정렬 로직 적용
  const sortedCategoriesDetailed = useMemo(() => {
    if (!Array.isArray(analysisData?.categoriesDetailed)) return [];
    return [...analysisData.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
  }, [analysisData?.categoriesDetailed]);

  const categoryData: any | null = (() => {
    // 전체 카테고리가 선택된 경우 (selectedCategoryIndex === -1)
    if (selectedCategoryIndex === -1 && allCategoriesData) {
      console.log('[Step3] 전체 카테고리 데이터를 사용합니다.');
      return allCategoriesData;
    }
    
    // 개별 카테고리가 선택된 경우
    if (sortedCategoriesDetailed.length > 0) {
      return sortedCategoriesDetailed[currentCatIdx] || null;
    }
    
    return null;
  })();

  const objToArr = (obj: Record<string, number> | undefined) =>
    obj ? Object.entries(obj).map(([k, v]) => ({ key: k, value: v })) : [];

  // 키워드 / 키워드수 / 태그 배열 생성
  const keywordsArray: any[] = categoryData ? objToArr(categoryData.keywords) : (analysisData?.keywords || []);
  const keywordCountsSrc: any = categoryData ? categoryData.keywordCounts : analysisData?.keywordCounts;
  const tagsArray: any[] = categoryData ? objToArr(categoryData.tags) : (analysisData?.tags || []);

  // ===== Step1에서 가져온 메시지 핸들러 =====
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'SEO_ANALYSIS_RESULT') {
        const data = event.data.data;
        if (Array.isArray(data.categoriesDetailed)) {
          data.categoriesDetailed = [...data.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
        }
        data._keyword = latestQueryRef.current;
        data._pageIndex = latestPageIndexRef.current;
        console.log('[Step3] Setting page index:', data._pageIndex, 'from latestPageIndexRef.current');
        setAnalysisData(data);
        setCtxAnalysisData(data);
        setAnalysisKeyword(latestQueryRef.current);
        setSelectedCategoryIndex(0);
        setIsOptimizing(false);
        optimizationInProgressRef.current = false;

        if (currentUser?.email) {
          (async () => {
            try {
              await UsageService.incrementProductOptimization(currentUser.email!);
              console.log('[Usage] Product optimization usage incremented after successful analysis (Step3)');
            } catch (error) {
              console.error('[Usage] Failed to increment usage (Step3):', error);
            }
          })();
        }

        if (currentUser?.email && latestQueryRef.current) {
          const actualPageIndex = data._pageIndex || 1;
          HistoryService.saveHistory(
            currentUser.email,
            latestQueryRef.current,
            'complete-optimizer',
            data,
            actualPageIndex
          ).catch(() => {});
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [currentUser, setCtxAnalysisData, setSynonymGroups, setCombResult, setSelectedMain, setGeneratedProductNames, setGeneratedReason, setGeneratedTags, setGeneratedCategories]);

  // ===== 확장프로그램 체크 (Step1에서 가져온 것) =====
  const checkExtensionInstalled = (): Promise<boolean> => {
    return new Promise((resolve) => {
      let resolved = false;
      
      const messageHandler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        if (event.data.type === "EXTENSION_STATUS" && !resolved) {
          console.log('[Step3] 확장프로그램 설치 확인됨 (postMessage):', event.data.installed);
          resolved = true;
          window.removeEventListener("message", messageHandler);
          resolve(event.data.installed === true);
        }
      };

      window.addEventListener("message", messageHandler);
      console.log('[Step3] 확장프로그램 설치 확인 요청 전송 (postMessage)');
      window.postMessage({ type: "CHECK_EXTENSION" }, window.location.origin);

      
      if (typeof (window as any).chrome !== 'undefined' && (window as any).chrome.runtime && (window as any).chrome.runtime.sendMessage) {
        console.log('[Step3] Chrome Extension API를 통한 확인 시도');
        
        try {
          (window as any).chrome.runtime.sendMessage(
            CHROME_EXTENSION_ID,
            { type: "CHECK_EXTENSION_INSTALLED" },
            (response: any) => {
              if (!resolved) {
                if ((window as any).chrome.runtime.lastError) {
                  console.log('[Step3] 확장프로그램 설치되지 않음 (Chrome API 오류):', (window as any).chrome.runtime.lastError.message);
                  resolved = true;
                  window.removeEventListener("message", messageHandler);
                  resolve(false);
                } else if (response && response.installed) {
                  console.log('[Step3] 확장프로그램 설치 확인됨 (Chrome API):', response);
                  resolved = true;
                  window.removeEventListener("message", messageHandler);
                  resolve(true);
                }
              }
            }
          );
        } catch (error) {
          console.log('[Step3] Chrome Extension API 오류:', error);
        }
      }

      setTimeout(() => {
        if (!resolved) {
          console.log('[Step3] 확장프로그램 설치되지 않음 (타임아웃)');
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

  // ===== 최적화 핸들러 (Step1에서 가져온 것) =====
  const handleOptimize = async () => {
    if (optimizationInProgressRef.current) return;
    optimizationInProgressRef.current = true;

    if (!productName.trim()) {
      optimizationInProgressRef.current = false;
      return;
    }

    const pageNum = parseInt(pageIndex, 10);
    if (isNaN(pageNum) || pageNum <= 0) {
      setPageError(true);
      optimizationInProgressRef.current = false;
      return;
    }
    setPageError(false);

    if (!currentUser) {
      setShowLoginModal(true);
      optimizationInProgressRef.current = false;
      return;
    }

    // 1) 사용량 제한 확인
    try {
      const usageLimit = await UsageService.checkProductOptimizationLimit(currentUser.email!);
      if (!usageLimit.canUse) {
        setUsageLimitMessage(`오늘 상품 최적화 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`);
        optimizationInProgressRef.current = false;
        return;
      }
      setUsageLimitMessage(null);
    } catch (error) {
      console.error('[Usage] Failed to check usage limit (Step3):', error);
      // 실패해도 진행
    }

    const isExtensionInstalled = await checkExtensionInstalled();
    if (!isExtensionInstalled) {
      setShowExtensionModal(true);
      optimizationInProgressRef.current = false;
      return;
    }

    // 새로운 분석을 시작하기 전에 기존 2/3단계 결과를 초기화하여 이전 분석 정보가 표시되지 않도록 한다.
    setSynonymGroups([]);
    setCombResult({});
    setGeneratedProductNames([]);
    setGeneratedReason('');
    setGeneratedTags([]);
    setGeneratedCategories([]);
    // 선택된 메인, 카테고리 등도 초기화 (필요 최소한)
    setSelectedMain('');

    latestQueryRef.current = productName.trim();
    latestPageIndexRef.current = pageNum;
    setIsOptimizing(true);
    trackEvent("ProductOptimizer", "optimize", "ProductName");

    window.postMessage(
      {
        type: "START_SEO_ANALYSIS",
        data: {
          productName: productName,
          pageIndex: pageNum,
          timeoutMs: 0, // 즉시 실행
        },
      },
      window.location.origin
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleOptimize();
    }
  };

  // ===== 기존 로직들 =====
  const excludedKeywordsObj = categoryData
    ? {
        query: categoryData.excludedQuery || [],
        numbers: categoryData.excludedNumbers || [],
        brands: categoryData.excludedBrands || [],
      }
    : analysisData?.excludedKeywords || { query: [], numbers: [], brands: [] };
  const excludedTagsRaw: any[] = categoryData ? categoryData.excludedTags || [] : analysisData?.excludedTags || [];

  // ===== 제외 키워드/태그 전처리 =====
  const excludedSame: string[] = (excludedKeywordsObj.query as string[]) || [];
  
  // 2단계 동의어 검사에서 메인키워드와 동일한 키워드로 판단된 키워드들 수집
  const synonymSameKeywords = useMemo(() => {
    const result: Array<{key: string, value: number}> = [];
    
    // 모든 메인키워드들 (원본 메인키워드 + 동일 키워드들)
    const allMainKeywords = new Set([
      ctxMainKeyword || "",
      selectedMain || ctxMainKeyword || "",
      ...excludedSame
    ]);
    
    // valueMap 생성 (키워드 빈도 조회용)
    const valueMap: Record<string, number> = {};
    keywordsArray.forEach((it: any) => {
      valueMap[it.key] = it.value;
    });
    
    synonymGroups.forEach(group => {
      if (group.merged && group.keywords.some(kw => allMainKeywords.has(kw))) {
        // 메인키워드가 포함된 동의어 그룹에서 메인키워드들 제외한 나머지 키워드들
        group.keywords.forEach(kw => {
          if (!allMainKeywords.has(kw)) {
            result.push({
              key: kw,
              value: valueMap[kw] || 0
            });
          }
        });
      }
    });
    
    return result;
  }, [synonymGroups, selectedMain, ctxMainKeyword, keywordsArray, excludedSame]);

  // 전체 동일 키워드 (기존 + 동의어 검사 결과)
  const excludedSameArr = useMemo(() => {
    return [...excludedSame, ...synonymSameKeywords];
  }, [excludedSame, synonymSameKeywords]);
  const excludedNumbers: string[] = (excludedKeywordsObj.numbers as string[]) || [];
  const excludedNumbersArr = excludedNumbers;
  const excludedBrands: string[] = (excludedKeywordsObj.brands as string[]) || [];
  const excludedBrandsArr = excludedBrands;
  const excludedTags: string[] = excludedTagsRaw;
  const excludedTagsArr = excludedTags;

  // === AI 상품명 생성 상태 및 처리 ===
  const [genLoading, setGenLoading] = useState(false);
  const [genName, setGenName] = useState<string | null>(null);
  const [genReason, setGenReason] = useState<string | null>(null);
  const [genDisabled, setGenDisabled] = useState(false);

  // Step1과 동일한 로직: 스텝 이동 후 돌아왔을 때 입력창에 이전 키워드를 자동으로 복원
  useEffect(() => {
    if (!productName && ctxMainKeyword) {
      setProductName(ctxMainKeyword);
    }
  }, [ctxMainKeyword, productName]);

  // analysisData와 동기화
  useEffect(() => {
    if (!analysisData && ctxAnalysisData) {
      setAnalysisData(ctxAnalysisData);
    }
    
    // 페이지 인덱스 복원 (분석 데이터가 있을 때마다 체크)
    if (ctxAnalysisData?._pageIndex && pageIndex === "1") {
      setPageIndex(ctxAnalysisData._pageIndex.toString());
      console.log('[Step3] 페이지 인덱스 복원:', ctxAnalysisData._pageIndex);
    }
    
    // Context mainKeyword가 들어오면 입력값과 analysisKeyword 동기화
    if (ctxMainKeyword && !productName) {
      setProductName(ctxMainKeyword);
      setAnalysisKeyword(ctxMainKeyword);
    }
  }, [ctxAnalysisData, ctxMainKeyword, analysisData, productName, pageIndex]);

  // 🆕 categoriesDetailed 초기화 - analysisData가 있을 때 즉시 설정
  useEffect(() => {
    if (analysisData?.categoriesDetailed && analysisData.categoriesDetailed.length > 0) {
      const sorted = [...analysisData.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
      setCategoriesDetailed(sorted);
      
      // 기존 결과가 있는지 확인 (2단계 또는 3단계 데이터가 있으면 기존 선택 유지)
      const hasExistingResults = synonymGroups.length > 0 || Object.keys(combResult).length > 0 || generatedProductNames.length > 0;
      
      if (hasExistingResults) {
        // 기존 결과가 있으면 선택된 카테고리 인덱스 유지
        const safeIdx = (selectedCategoryIndex >= 0 && selectedCategoryIndex < sorted.length)
          ? selectedCategoryIndex
          : 0;
        setCurrentCatIdx(safeIdx);
      } else {
        // 새로운 분석이면 0으로 초기화
        setCurrentCatIdx(0);
      }
    }
  }, [analysisData?.categoriesDetailed, selectedCategoryIndex, synonymGroups.length, Object.keys(combResult).length, generatedProductNames.length]);

  // 페이지 인덱스 초기화 (ctxAnalysisData가 로드될 때)
  useEffect(() => {
    if (ctxAnalysisData?._pageIndex && pageIndex === "1") {
      setPageIndex(ctxAnalysisData._pageIndex.toString());
      latestPageIndexRef.current = ctxAnalysisData._pageIndex;
      console.log('[Step3] 초기 페이지 인덱스 설정:', ctxAnalysisData._pageIndex);
    }
  }, [ctxAnalysisData?._pageIndex]); // ctxAnalysisData._pageIndex가 변경될 때만 실행

  // 히스토리에서 복원된 3단계 데이터가 있으면 설정
  useEffect(() => {
    if (generatedProductNames.length > 0 && !genName) {
      setGenName(generatedProductNames[0] || null);
    }
    if (generatedReason && !genReason) {
      setGenReason(generatedReason);
    }
  }, [generatedProductNames, generatedReason, genName, genReason]);

  // 3단계로 진입 시 적절한 위치로 스크롤
  useEffect(() => {
    // AI 상품명 결과가 있으면 0, 없으면 750으로 스크롤
    const scrollTop = (genName || generatedProductNames.length > 0) ? 400 : 750;
    window.scrollTo({ top: scrollTop, behavior: 'auto' });
  }, [genName, generatedProductNames.length]);

  // --- placeholder: 키워드 배열 — handleGenerate 등에서 사용
  let displayKeywordsCurrent: { label: string; type: string; count: number }[] = [];
  
  // 새로운 분석 결과일 때는 Step1 스타일 키워드 사용
  const step1StyleKeywords = useMemo(() => {
    if (!analysisData?.keywords) return [];
    return analysisData.keywords
      .sort((a: any, b: any) => b.value === a.value ? a.key.localeCompare(b.key) : b.value - a.value)
      .map((k: any) => ({ label: k.key, type: 'normal', count: k.value }));
  }, [analysisData?.keywords]);

  // show/hide toggles for lists
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllKeywordCounts, setShowAllKeywordCounts] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  // ===== Step1 스타일 분석 결과 표시를 위한 상태들 =====
  const [categoriesDetailed, setCategoriesDetailed] = useState<any[]>([]);
  // 현재 컨텍스트에서 선택된 카테고리 인덱스를 우선 사용

  const [showAllCatKeywords, setShowAllCatKeywords] = useState(false);
  const [showAllCatKeywordCounts, setShowAllCatKeywordCounts] = useState(false);
  const [showAllCatTags, setShowAllCatTags] = useState(false);

  // ===== Step1에서 가져온 헬퍼 함수들 =====
  const handleNext = () => {
    if (analysisData && onDone) onDone();
  };

  // 캐러셀 이동
  const prevCategory = () => {
    if (categoriesDetailed.length === 0) return;
    setCurrentCatIdx((prev) => {
      const next = (prev - 1 + categoriesDetailed.length) % categoriesDetailed.length;
      setSelectedCategoryIndex(next);
      return next;
    });
  };

  const nextCategory = () => {
    if (categoriesDetailed.length === 0) return;
    setCurrentCatIdx((prev) => {
      const next = (prev + 1) % categoriesDetailed.length;
      setSelectedCategoryIndex(next);
      return next;
    });
  };

  // 전체 카테고리가 선택된 경우 캐러셀을 표시하지 않음
  const shouldShowCarousel = selectedCategoryIndex !== -1;
  const currentCategory = shouldShowCarousel && categoriesDetailed.length > 0 ? categoriesDetailed[currentCatIdx] : null;

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

  const renderAttributeTable = () => {
    let pd: any[] = [];

    if (currentCategory && currentCategory.categoryPath === '전체 카테고리') {
      // 전체 카테고리 → 모든 카테고리 pairedData 집계
      if (analysisData?.categoriesDetailed) {
        const allPairedData: Record<string, any> = {};
        analysisData.categoriesDetailed.forEach((cat: any) => {
          if (Array.isArray(cat.pairedData)) {
            cat.pairedData.forEach((pair: any) => {
              if (!allPairedData[pair.attribute]) {
                allPairedData[pair.attribute] = { attribute: pair.attribute, characters: [] } as any;
              }
              pair.characters.forEach((char: any) => {
                const existing = allPairedData[pair.attribute].characters.find((c: any) => c.character === char.character);
                if (existing) existing.count += char.count;
                else allPairedData[pair.attribute].characters.push({ ...char });
              });
            });
          }
        });
        Object.values(allPairedData).forEach((pair: any) => {
          pair.characters.sort((a: any, b: any) => b.count - a.count);
        });
        pd = Object.values(allPairedData);
      }
    } else {
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



  // ===== Step1 스타일 키워드/태그 정렬 로직 =====
  const sortedKeywords = useMemo(() => {
    if (!analysisData?.keywords) return [] as any[];
    return [...analysisData.keywords].sort((a: any, b: any) =>
      b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value
    );
  }, [analysisData?.keywords]);

  const topKeywordsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedKeywords, 12, (k: any) => k.value),
    [sortedKeywords]
  );

  const sortedTagsAll = useMemo(() => {
    if (!analysisData?.tags) return [] as any[];
    // 빈도수가 같으면 원본 배열 순서 유지 (안정 정렬)
    return [...analysisData.tags].sort((a: any, b: any) => {
      if (b.value !== a.value) return b.value - a.value;
      return 0;
    });
  }, [analysisData?.tags]);

  const topTagsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedTagsAll, 12, (t: any) => t.value),
    [sortedTagsAll]
  );

  const lastTieIdxKeywordStep1 = topKeywordsWithTies.length - 1;
  const lastTieIdxTagStep1 = topTagsWithTies.length - 1;

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
    // 빈도수가 같으면 원본 순서 유지
    return [...Object.entries(currentCategory.tags || {})].sort((a: any, b: any) => {
      if ((b[1] as number) !== (a[1] as number)) return (b[1] as number) - (a[1] as number);
      return 0;
    });
  }, [currentCategory]);

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

  const topCatKeywordsWithTies = useMemo(
    () =>
      getTopWithTieMinimum(sortedCatKeywords, 12, (it) => it[1] as number),
    [sortedCatKeywords]
  );

  const lastTieIdxCatKeyword = topCatKeywordsWithTies.length - 1;
  const lastTieIdxCatKC = topCatKeywordCountsWithTies.length - 1;
  const lastTieIdxCatTag = topCatTagsWithTies.length - 1;

  // ===== 표시 조건 로직 =====
  // 기존 완성된 결과가 있는지 (2단계 + 3단계 데이터가 있는지) 확인
  const hasExistingResults = synonymGroups.length > 0 || Object.keys(combResult).length > 0 || generatedProductNames.length > 0;
  // 새로운 분석 결과인지 확인 (분석은 완료되었지만 2/3단계 데이터가 없는 경우)
  const isNewAnalysisResult = analysisData && productName.trim() === analysisKeyword && !hasExistingResults;

  const handleGenerate = async () => {
    if (genLoading || genDisabled) return;
    
    // 이전에 AI 상품명이 이미 생성되었는지 여부 확인
    const hadPrevGenerated = genName !== null || generatedProductNames.length > 0;

    // 🔒 사용량 제한 체크
    if (currentUser?.email) {
      if (hadPrevGenerated) {
        // 이미 생성된 적이 있을 때만 사용량을 확인하여 초과 시 차단
        try {
          const usageLimit = await UsageService.checkProductOptimizationLimit(currentUser.email);
          if (!usageLimit.canUse) {
            setUsageLimitMessage(`오늘 상품 최적화 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`);
            return; // 실행 중단
          }
        } catch (error) {
          console.error('[Usage] Failed to check usage limit (Generate):', error);
          // 체크 실패 시에도 진행하지만 메시지는 보류
        }
      } else {
        // 첫 번째 생성 시에는 사용량 메시지를 초기화하고 제한을 무시
        setUsageLimitMessage(null);
      }
    } else {
      // 로그인 안 된 상태라면 기존 로직 유지 (로그인 모달 표시)
      setShowLoginModal(true);
      return;
    }

    // GA – 상품명 생성 버튼 클릭
    trackEvent('GenerateName', 'complete_click', null, {
      keyword: ctxMainKeyword,
      query: productName.trim(),
    });
    
    setGenLoading(true);
    try {
      const normalize = (s:string)=> s.replace(/\s+/g,'').toLowerCase();

      let query = ctxMainKeyword;
      
      // --- queryKind 계산: 쿼리가 조합형/일체형인지 유추 ---
      const normalizedSelectedMain = (selectedMain || ctxMainKeyword)?.replace(/\s+/g, '');
      const normalizedQuery = ctxMainKeyword.replace(/\s+/g, '');
      let queryKind: '조합형' | '일체형' | undefined = combResult[ctxMainKeyword] as any;

      // combResult 키가 괄호(=) 표현을 포함해 정확히 매칭되지 않는 경우 대비
      if (!queryKind) {
        const norm = (s:string)=> s.replace(/\(.*?\)/g,'').replace(/\s+/g,'');
        const found = Object.entries(combResult).find(([kw, kind])=>
          kind === '조합형' && norm(kw) === normalizedQuery
        );
        if(found) queryKind='조합형';
      }

      // combResult에 직접 정보가 없더라도, 공백 없이 메인키워드가 포함되어 있으면 일체형으로 간주
      // 여기서 메인키워드는 combMainMap에서 찾은 실제 매핑된 메인키워드를 우선 사용
      const mappedMainForQuery = combMainMap[ctxMainKeyword] || selectedMain || ctxMainKeyword;
      const normalizedMappedMain = mappedMainForQuery?.replace(/\s+/g, '');
      if (!queryKind && normalizedMappedMain && normalizedQuery !== normalizedMappedMain && normalizedQuery.includes(normalizedMappedMain)) {
        queryKind = '일체형';
      }

      // 1) query 자체가 조합형인지 확인
      if (queryKind === '조합형') {
        // 메인 키워드 결정 (combMainMap > selectedMain > fallback)
        let mainForQuery: string | undefined = combMainMap[ctxMainKeyword];
        if (!mainForQuery) {
          const candidates = new Set<string>();
          if(selectedMain) candidates.add(selectedMain);
          Object.values(combMainMap).forEach((v)=>{ if(v) candidates.add(v); });

          // 동의어 그룹에 포함된 키워드들도 후보에 추가
          if (selectedMain) {
            const synGroup = synonymGroups.find((g)=> g.merged && g.keywords.includes(selectedMain));
            if (synGroup) synGroup.keywords.forEach((k)=>candidates.add(k));
          }

          // 길이 긴 후보부터 확인해 query 안에 실제 등장하는 키워드를 선택
          [...candidates].sort((a,b)=>b.length-a.length).some((cand)=>{
            if(ctxMainKeyword.includes(cand)) { mainForQuery=cand; return true; }
            return false;
          });
          // 여전히 못 찾으면 selectedMain 사용
          if(!mainForQuery) mainForQuery = selectedMain || ctxMainKeyword;
        }

        // mainForQuery 가 query 내부에 들어 있는지 확인 후 분리
        const splitIdx = ctxMainKeyword.indexOf(mainForQuery);
        if (splitIdx !== -1) {
          const before = ctxMainKeyword.slice(0, splitIdx).trim();
          const after  = ctxMainKeyword.slice(splitIdx + mainForQuery.length).trim();

          if (before) {
            // comb키워드가 앞에 올 때
            query = `${before}, ${mainForQuery}`;
          } else if (after) {
            // comb키워드가 뒤에 올 때 (드문 케이스)
            query = `${mainForQuery}, ${after}`;
          } else {
            // 예외: 분리 실패 시 기존 로직 유지(공백 없음)
            query = `${mainForQuery}`;
          }
        }
      } else {
      // 2) 효율적인 조합형 키워드 분할: 한 번의 순회로 모든 위치 찾기
      const combKeywords = Object.entries(combResult)
        .filter(([, kind]) => kind === '조합형')
        .map(([kw]) => kw)
        .sort((a, b) => b.length - a.length); // 긴 키워드부터 처리
      
      if (combKeywords.length > 0) {
        const normalizedMain = normalize(ctxMainKeyword);
        const positions: Array<{keyword: string, start: number, end: number}> = [];
        
        // 모든 조합형 키워드의 위치를 한 번에 찾기
        for (const combKw of combKeywords) {
          const normalizedComb = normalize(combKw);
          let startIndex = 0;
          
          while (true) {
            const index = normalizedMain.indexOf(normalizedComb, startIndex);
            if (index === -1) break;
            
            positions.push({
              keyword: combKw,
              start: index,
              end: index + combKw.length
            });
            startIndex = index + 1;
          }
        }
        
        // 위치를 시작점 기준으로 정렬하고 겹치는 부분 제거
        positions.sort((a, b) => a.start - b.start);
        const nonOverlapping = positions.filter((pos, idx) => {
          if (idx === 0) return true;
          return pos.start >= positions[idx - 1].end;
        });
        
        // 분할된 부분들을 순서대로 조합
        if (nonOverlapping.length > 0) {
          const parts: string[] = [];
          let lastEnd = 0;
          
          for (const pos of nonOverlapping) {
            if (pos.start > lastEnd) {
              const beforePart = ctxMainKeyword.substring(lastEnd, pos.start).trim();
              if (beforePart) parts.push(beforePart);
            }
            parts.push(pos.keyword);
            lastEnd = pos.end;
          }
          
          if (lastEnd < ctxMainKeyword.length) {
            const afterPart = ctxMainKeyword.substring(lastEnd).trim();
            if (afterPart) parts.push(afterPart);
          }
          
          query = parts.join(' ');
        }
      }

      // === NEW: Include selected main keyword when original query is 일체형 but comb keywords exist ===
      if (queryKind === '일체형') {
        // 2단계에서 조합형 검사한 메인 키워드 중, query와 완전히 동일하지 않은 메인 키워드가 있는지 찾기
        const extraMainKeywords = Object.entries(combResult)
          .filter(([kw, kind]) => kind === '조합형')
          .map(([kw]) => combMainMap[kw])
          .filter(mainKw => mainKw && mainKw !== ctxMainKeyword);

        // 중복 제거
        const uniqueExtraMainKeywords = Array.from(new Set(extraMainKeywords));

        if (uniqueExtraMainKeywords.length > 0) {
          // query에 이미 포함되어 있지 않은 메인 키워드만 추가
          let tokens = [query, ...uniqueExtraMainKeywords.filter(mk => !query.split(/[\,\s]+/).includes(mk))];
          query = tokens.join(', ');
        }
      }

      // 3) 추가 처리: query 내에 등장하는 메인키워드(동의어 포함)와 나머지 부분으로 분할
      // 단, query 자체가 일체형인 경우는 분할하지 않음
      if (false && query === ctxMainKeyword && combResult[ctxMainKeyword] !== '일체형') {
        const mainCandidates: string[] = [];
        const push = (kw: string | undefined) => {
          if (kw && !mainCandidates.includes(kw)) mainCandidates.push(kw);
        };

        // 선택된 메인키워드 + 동의어 그룹 키워드 중 query에 실제 포함된 것들
        push(selectedMain);
        synonymGroups.forEach((g) => {
          if (!g.merged) return;
          const appearsInQuery = g.keywords.some((k) => ctxMainKeyword.includes(k));
          if (appearsInQuery) {
            g.keywords.forEach(push);
          }
        });

        // 길이 긴 후보부터 시도 (길이가 길수록 정확도 ↑)
        mainCandidates.sort((a, b) => (b.length - a.length));

        for (const mainCand of mainCandidates) {
          const idx = ctxMainKeyword.indexOf(mainCand);
          if (idx === -1) continue;
          const before = ctxMainKeyword.slice(0, idx).trim();
          const after = ctxMainKeyword.slice(idx + mainCand.length).trim();

          if (before) {
            query = `${before}, ${mainCand}`;
            break;
          } else if (after) {
            query = `${mainCand}, ${after}`;
            break;
          }
        }
      }
    }

      // ----- [FIX] 추가 분리 로직: 메인 키워드가 붙어있는 잔여 토큰 분리 -----
      // 각 키워드별로 실제 매핑된 메인키워드를 찾아서 사용
      const getMainKeywordForToken = (token: string): string => {
        // 1) combMainMap에서 해당 토큰의 메인키워드 찾기
        if (combMainMap[token]) return combMainMap[token];
        
        // 2) 조합형 결과에서 해당 토큰이 포함된 키워드의 메인키워드 찾기
        for (const [combKw, kind] of Object.entries(combResult)) {
          if (kind === '조합형' && combKw.includes(token) && combMainMap[combKw]) {
            return combMainMap[combKw];
          }
        }
        
        // 3) fallback: selectedMain 또는 ctxMainKeyword
        return selectedMain || ctxMainKeyword;
      };
      
      const refinedParts: string[] = [];
      const clean = (t:string)=> t.replace(/,+$/,'').replace(/^,+/,'').trim();
      query.split(' ').forEach((rawTok) => {
        const tok = clean(rawTok);
        if (!tok) return;
        
        // 토큰에 대한 실제 매핑된 메인키워드 찾기
        const mainForTok = getMainKeywordForToken(tok);
        const mainTrim = mainForTok.replace(/\s+/g, "");
        
        if (
          tok !== mainTrim &&
          tok.endsWith(mainTrim) &&
          tok.length > mainTrim.length
        ) {
          const prefix = tok.slice(0, tok.length - mainTrim.length);
          // combResult 에서 prefix 가 조합형으로 판정된 경우 또는
          // combResult 의 조합형 키 중 괄호/공백을 제거한 형태가 prefix 와 일치하는 경우에 분리
          const isCombPrefix =
            combResult[prefix] === '조합형' ||
            Object.entries(combResult).some(
              ([kw, kind]) =>
                kind === '조합형' &&
                kw.replace(/\(.*?\)/g, '').replace(/\s+/g, '') === prefix
            );
          if (isCombPrefix) {
            refinedParts.push(clean(prefix), mainTrim);
            return;
          }
        }
        refinedParts.push(tok);
      });
      query = refinedParts.filter(Boolean).join(', ').replace(/\s*,\s*/g, ', ').replace(/,{2,}/g, ',').replace(/\s{2,}/g,' ').trim();

      // 12위와 동점인 키워드까지 모두 포함하도록 길이를 계산합니다.
      const keyword = displayKeywordsCurrent
        .slice(0, collapsedKeywordLen)  // 동점 포함 12위까지
        .map((k) => k.label)
        .join(', ');
      
      // 키워드 개수 결정: 빈도수가 같으면 키워드 개수가 큰 것을 우선 선택
      // topKeywordCounts는 이미 정렬되어 있으므로 첫 번째 요소가 최적값
      console.log('[Step3Generate] topKeywordCounts:', topKeywordCounts);
      const keywordCount = String(topKeywordCounts[0]?.key || '2');
      console.log('[Step3Generate] 선택된 keywordCount:', keywordCount);
      console.log('[Step3Generate] fetch /api/generate-name', { query, keywordCount });

      const resp = await fetch('/api/generate-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, keyword, keywordCount }),
      });
      if (!resp.ok) {
        throw new Error('failed');
      }
      const json = await resp.json();
      setGenName(json.productName);
      setGenReason(json.reason);
      
      // GA4 – 상품명 생성 성공 이벤트 (생성된 상품명, 키워드 매개변수 포함)
      trackEvent('GenerateName', 'complete_success', null, {
        keyword: ctxMainKeyword,
        query: query,
        pageIndex: (analysisData as any)?._pageIndex || 1,
        keywordCount,
        generatedName: json.productName,
        keywords: keyword,
      });
      
      // 추천 태그 생성 (상위 태그)
      const recommendedTags = tagsArray
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
        .slice(0, 12)
        .map((tag: any) => tag.key);
      
        // 추천 카테고리 생성
  const recommendedCategories = (() => {
    // 전체 카테고리가 선택된 경우 가장 빈도가 높은 개별 카테고리 추천
    if (selectedCategoryIndex === -1 || (categoryData && categoryData.categoryPath === "전체 카테고리")) {
      return sortedCategoriesDetailed.length > 0 
        ? [sortedCategoriesDetailed[0].categoryName || sortedCategoriesDetailed[0].categoryPath || '']
        : [];
    }
    
    // 개별 카테고리가 선택된 경우
    if (categoryData) {
      return [categoryData.categoryName || categoryData.categoryPath || ''];
    }
    
    // fallback
    return (analysisData && analysisData.categoriesDetailed?.[0]?.categoryName)
      ? [analysisData.categoriesDetailed[0].categoryName]
      : [];
  })();
      
      // Context 상태 업데이트
      setGeneratedProductNames([json.productName]);
      setGeneratedReason(json.reason);
      setGeneratedTags(recommendedTags);
      setGeneratedCategories(recommendedCategories.filter(Boolean));
      
      // ✅ 사용량 1회 증가 – 이전에 생성된 결과가 있을 때만 카운트
      if (hadPrevGenerated && currentUser?.email) {
        try {
          await UsageService.incrementProductOptimization(currentUser.email);
          console.log('[Usage] Product optimization usage incremented (Generate – repeat)');
        } catch (error) {
          console.error('[Usage] Failed to increment usage (Generate – repeat):', error);
        }
      }

      // 히스토리 업데이트 (3단계 데이터 저장)
      if (currentUser?.email && ctxMainKeyword) {
        const pageIndex = (analysisData as any)?._pageIndex;
        
        const step3Data = {
          productNames: [json.productName],
          reason: json.reason,
          tags: recommendedTags,
          categories: recommendedCategories.filter(Boolean)
        };
        
        // 기존 히스토리 컬렉션 업데이트 (레거시)
        await HistoryService.updateHistoryWithStep3Data(
          currentUser.email,
          ctxMainKeyword,
          step3Data,
          pageIndex
        );

        // 월→uid 구조 저장/업데이트
        await HistoryService.saveCompleteProductNameOptimize(
          currentUser.email,
          currentUser.uid,
          ctxMainKeyword,
          {
            currentStep: 3,
            step3Data,
          },
          pageIndex
        );
        console.log('[Step3] Complete product optimization data saved');
      }
    } catch (e: any) {
      alert('상품명 생성 실패');
      console.error(e);
    } finally {
      setGenLoading(false);
      
      // 생성 완료 후 5초 동안 버튼 비활성화
      setGenDisabled(true);
      setTimeout(() => {
        setGenDisabled(false);
      }, 5000);
    }
  };

  // 전체 정렬 배열 (내림차순)
  const allKeywordCounts = useMemo(() => {
    let arr: { key: string; value: number }[] = [];
    const src = keywordCountsSrc;
    if (Array.isArray(src) && src.length > 0) {
      arr = src as any;
    } else if (src && typeof src === 'object' && Object.keys(src).length > 0) {
      arr = Object.entries(src as Record<string, number>).map(([k, v]) => ({ key: k, value: v as number }));
    } else if (analysisData && Array.isArray(analysisData.categoriesDetailed)) {
      const agg: Record<string, number> = {};
      for (const cat of analysisData.categoriesDetailed) {
        const kcObj = cat.keywordCounts;
        if (kcObj && typeof kcObj === 'object') {
          for (const [k, v] of Object.entries(kcObj as Record<string, number>)) {
            agg[k] = (agg[k] || 0) + (v as number);
          }
        }
      }
      arr = Object.entries(agg).map(([k, v]) => ({ key: k, value: v }));
    }
    return [...arr].sort((a, b) => {
      if (b.value !== a.value) {
        return b.value - a.value; // 빈도수 내림차순
      }
      return Number(b.key) - Number(a.key); // 빈도수가 같으면 키워드 개수 내림차순
    });
  }, [keywordCountsSrc, analysisData]);

  // 상위 키워드 카운트 배열 별칭 (기존 레거시 변수 보존)
  const topKeywordCounts = allKeywordCounts;

  // ===== 키워드수 12위(+동점) 접기 길이 =====
  const keywordCntThreshold =
    allKeywordCounts.length >= 12
      ? allKeywordCounts[11].value
      : allKeywordCounts[allKeywordCounts.length - 1]?.value ?? 0;
  const collapsedKeywordCntLen =
    allKeywordCounts.findIndex((it) => it.value < keywordCntThreshold) === -1
      ? allKeywordCounts.length
      : allKeywordCounts.findIndex((it) => it.value < keywordCntThreshold);

  // ===== 키워드 / 태그 필터 =====
  const displayKeywordsInfo: DisplayKeywordInfo[] = useMemo(() => {
    // map for quick count lookup
    const valueMap: Record<string, number> = {};
    keywordsArray.forEach((it: any) => {
      valueMap[it.key] = it.value;
    });

    // helper to push contributor without duplicate
    const pushContrib = (arr:string[], kw:string)=>{ if(!arr.includes(kw)) arr.push(kw); };

    const stripParen = (s: string) => (s.includes('(') ? s.split('(')[0].trim() : s);

    // 모든 메인키워드들 (원본 메인키워드 + 동일 키워드들)
    const allMainKeywords = new Set([
      ctxMainKeyword || "",
      selectedMain || ctxMainKeyword || "",
      ...excludedSame
    ]);

    // 메인키워드와 동일한 키워드로 판단된 동의어 그룹 식별
    const mainSynonymGroups = synonymGroups.filter((g) => 
      g.merged && g.keywords.some(kw => allMainKeywords.has(kw))
    );
    
    // 메인키워드와 동일하지 않은 동의어 그룹만 표시용으로 사용
    const mergedGroups = synonymGroups.filter((g) => 
      g.merged && !g.keywords.some(kw => allMainKeywords.has(kw))
    );

    // 메인키워드와 동일한 키워드들을 완전히 제외하기 위한 Set
    const mainSynonymKeywords = new Set<string>();
    mainSynonymGroups.forEach((g) => {
      g.keywords.forEach((k) => mainSynonymKeywords.add(k));
    });

    // 디버깅 로그
    console.log('[Step3Generate] 선택된 메인키워드:', selectedMain || ctxMainKeyword);
    console.log('[Step3Generate] 모든 메인키워드들:', Array.from(allMainKeywords));
    console.log('[Step3Generate] mainSynonymGroups:', mainSynonymGroups);
    console.log('[Step3Generate] mainSynonymKeywords:', Array.from(mainSynonymKeywords));
    console.log('[Step3Generate] mergedGroups:', mergedGroups);

    // map: keyword -> groupRep (모든 동의어 그룹 포함)
    const keywordToRep: Record<string, string> = {};
    const repDisplay: Record<string, string> = {};
    const repCountSum: Record<string, number> = {};
    const keywordToGroup: Record<string, any> = {}; // 키워드가 속한 그룹 정보

    // 모든 merged 그룹에 대해 매핑 생성 (메인키워드 동일 그룹 + 일반 그룹)
    const allMergedGroups = synonymGroups.filter((g) => g.merged);
    allMergedGroups.forEach((g) => {
      // Step2에서 이미 메인 키워드 및 동일 키워드가 포함된 키워드를 대표 키워드로 설정했으므로
      // g.keywords[0]이 이미 올바른 대표 키워드입니다
      const rep = g.keywords[0];
      const others = g.keywords.slice(1);
      g.keywords.forEach((k) => {
        keywordToRep[k] = rep;
        keywordToGroup[k] = g; // 키워드가 속한 그룹 정보 저장
      });
      repDisplay[rep] = others.length ? `${rep}(=${others.join(', ')})` : rep;

      // count 합산
      const sum = g.keywords.reduce((acc, k) => acc + (valueMap[k] || 0), 0);
      repCountSum[rep] = sum;
    });

    const independentSet = new Set<string>(
      Object.entries(combResult)
        .filter(([, v]) => (v as any) === '일체형')
        .map(([k]) => k)
    );

    const combSet = new Set<string>(
      Object.entries(combResult)
        .filter(([,v])=> (v as any) === '조합형')
        .map(([k])=>k)
    );

    const skipSet = new Set<string>();
    const mergedKeywordsSet = new Set<string>(); // 동의어이자 조합형 키워드에 합산된 키워드들을 추적

    // 키워드별 실제 매핑된 메인키워드를 찾는 헬퍼 함수
    const getMainKeywordFor = (keyword: string): string => {
      // 1) combMainMap에서 직접 매핑 확인
      if (combMainMap[keyword]) return combMainMap[keyword];
      
      // 2) 동의어 그룹에서 해당 키워드가 포함된 그룹의 대표 키워드의 메인키워드 확인
      const group = keywordToGroup[keyword];
      if (group && group.keywords && group.keywords.length > 0) {
        const representative = group.keywords[0];
        if (combMainMap[representative]) return combMainMap[representative];
      }
      
      // 3) 조합형 결과에서 해당 키워드가 포함된 키워드의 메인키워드 확인
      for (const [combKw, kind] of Object.entries(combResult)) {
        if ((kind === '조합형' || kind === '일체형') && combKw.includes(keyword) && combMainMap[combKw]) {
          return combMainMap[combKw];
        }
      }
      
      // 4) fallback: selectedMain 또는 ctxMainKeyword
      return selectedMain || ctxMainKeyword || "";
    };

    // 메인키워드(기본) - 전역적으로 사용되는 기본 메인키워드 (fallback용)
    const defaultMainKeyword = selectedMain || ctxMainKeyword;

    // 조합형/일체형 키워드와 일반 키워드 매핑 생성
    const combMappings: Record<string, { baseKeyword: string; fullKeyword: string; type: 'comb' | 'indep' }> = {};
    
    // 동의어이자 조합형인 키워드에 합산될 base 키워드들을 미리 계산
    const synonymCombBaseKeywords = new Set<string>();
    allMergedGroups.forEach((g) => {
      if (g.merged && !mainSynonymGroups.includes(g)) {
        const rep = g.keywords[0];
        const baseFromRep = rep.replace(defaultMainKeyword, '').trim();
        
        // 조합형 여부 확인
        let hasComb = false;
        const combKeysArr = Array.from(combSet);
        const repNoSpace = rep.replace(/\s+/g, '');
        const baseNoSpace = baseFromRep.replace(/\s+/g,'');

        if (baseFromRep && combSet.has(baseFromRep)) {
          hasComb = true;
        }
        if (!hasComb) {
          hasComb = combKeysArr.some(k => {
            const norm = k.replace(/\s+/g,'');
            return norm.includes(repNoSpace) || (baseNoSpace && norm.includes(baseNoSpace));
          });
        }
        if (!hasComb) {
          hasComb = g.keywords.some(gkw => combSet.has(gkw) || combKeysArr.some(key=> key.includes(gkw)));
        }
        
        // 동의어+조합형이고 base 키워드가 있다면 미리 수집
        if (hasComb && baseFromRep && valueMap[baseFromRep]) {
          synonymCombBaseKeywords.add(baseFromRep);
          // 동의어 그룹 내의 모든 키워드에서 base 키워드 찾기
          g.keywords.forEach(groupKw => {
            const baseFromGroupKw = groupKw.replace(defaultMainKeyword, '').trim();
            if (baseFromGroupKw && valueMap[baseFromGroupKw]) {
              synonymCombBaseKeywords.add(baseFromGroupKw);
            }
          });
        }
      }
    });
    
    // 조합형 키워드 처리
    for (const combKeyword of combSet) {
      const mainForKw = combMainMap[combKeyword] || selectedMain || ctxMainKeyword;
      const stripped = combKeyword.replace(mainForKw, '').trim();
      if (stripped) {
        // 합산될 base 키워드인 경우 매핑하지 않음
        if (synonymCombBaseKeywords.has(stripped)) {
          continue;
        }
        
        // 메인키워드 + 조합형키워드 또는 조합형키워드 + 메인키워드 형태 확인
        const frontComb = `${stripped}${mainForKw}`;
        const backComb = `${mainForKw}${stripped}`;
        
        // 실제 키워드 목록에서 정확한 매칭 찾기
        if (valueMap[frontComb]) {
          combMappings[frontComb] = { baseKeyword: stripped, fullKeyword: frontComb, type: 'comb' };
        }
        if (valueMap[backComb]) {
          combMappings[backComb] = { baseKeyword: stripped, fullKeyword: backComb, type: 'comb' };
        }
        
        // 조합형 키워드 자체가 상위 키워드에 있다면 base로 사용할 수 있는 키워드들과 매핑
        if (valueMap[stripped]) {
          combMappings[stripped] = { baseKeyword: stripped, fullKeyword: combKeyword, type: 'comb' };
        }
      }
    }
    
    // 일체형 키워드 처리 (메인 키워드 포함·미포함 모두 지원)
    for (const indepKeyword of independentSet) {
      const mainForKw = combMainMap[indepKeyword] || selectedMain || ctxMainKeyword;
      const stripped = stripParen(indepKeyword);

      let baseKeyword = '';
      let fullKeyword = '';

      if (stripped.includes(mainForKw)) {
        // 이미 메인 키워드가 붙어있는 형태
        fullKeyword = stripped; // 예: 활새우
        baseKeyword = stripped.replace(mainForKw, '').trim(); // 예: 활
      } else {
        // 메인 키워드가 아직 안 붙은 형태
        baseKeyword = stripped;            // 예: 활
        fullKeyword = `${stripped}${mainForKw}`; // 예: 활새우
      }

      if (!baseKeyword) continue; // base없으면 스킵

      // 매핑: base / full 모두 저장해 합산할 수 있게
      combMappings[baseKeyword] = { baseKeyword, fullKeyword, type: 'indep' };
      combMappings[fullKeyword] = { baseKeyword, fullKeyword, type: 'indep' };
    }

    // 전처리: 동의어+조합형 키워드에서 합산될 base 키워드들을 미리 skipSet에 추가
    allMergedGroups.forEach((g) => {
      if (g.merged && !mainSynonymGroups.includes(g)) {
        const rep = g.keywords[0];
        const mainKeywordForRep = getMainKeywordFor(rep);
        const baseFromRep = rep.replace(mainKeywordForRep, '').trim();
        
        // 조합형 여부 확인
        let hasComb = false;
        const combKeysArr = Array.from(combSet);
        const repNoSpace = rep.replace(/\s+/g, '');
        const baseNoSpace = baseFromRep.replace(/\s+/g,'');

        if (baseFromRep && combSet.has(baseFromRep)) {
          hasComb = true;
        }
        if (!hasComb) {
          hasComb = combKeysArr.some(k => {
            const norm = k.replace(/\s+/g,'');
            return norm.includes(repNoSpace) || (baseNoSpace && norm.includes(baseNoSpace));
          });
        }
        if (!hasComb) {
          hasComb = g.keywords.some(gkw => combSet.has(gkw) || combKeysArr.some(key=> key.includes(gkw)));
        }
        
        // 동의어+조합형이고 base 키워드가 있다면 미리 skipSet에 추가
        if (hasComb && baseFromRep && valueMap[baseFromRep]) {
          skipSet.add(baseFromRep);
          const baseWithMain = `${baseFromRep}${mainKeywordForRep}`;
          const mainWithBase = `${mainKeywordForRep}${baseFromRep}`;
          skipSet.add(baseWithMain);
          skipSet.add(mainWithBase);
        }
      }
    });

    // aggregate map for duplicate labels
    const agg: Record<string, { label: string; types: Set<'synonym'|'indep'|'comb'|'normal'>; count: number; contributors:string[] }> = {};

    for (const kwObj of keywordsArray) {
      const kw = kwObj.key || kwObj; // flexible access

      if(skipSet.has(kw)) continue;
      
      // 메인키워드와 동일한 키워드로 판단된 키워드는 건너뛰기
      if(mainSynonymKeywords.has(kw)) continue;
      
      // 디버깅: 합산된 키워드인지 확인
      if (mergedKeywordsSet.has(kw)) {
        console.log(`[Step3] 합산된 키워드 "${kw}" 스킵됨`);
        skipSet.add(kw);
        continue;
      }

      let label = kw as string;
      let type: 'synonym' | 'indep' | 'comb' | 'normal' = 'normal';
      let count = valueMap[kw] || 0;
      let contributors: string[] = [kw];

      // 동의어 처리 (최우선)
      if (keywordToRep[kw]) {
        // 메인키워드와 동일한 그룹에 속한 키워드인지 체크
        const belongsToGroup = keywordToGroup[kw];
        const isMainSynonymGroup = mainSynonymGroups.includes(belongsToGroup);
        
        if (isMainSynonymGroup) {
          // 메인키워드와 동일한 그룹의 키워드는 건너뛰기
          continue;
        }
        
        const rep = keywordToRep[kw];
        const displayLabel = repDisplay[rep] || rep;
        
        // 이미 처리된 동의어 그룹인지 확인
        if (agg[displayLabel]) {
          // 이미 처리된 동의어 키워드는 건너뛰기
          continue;
        }
        
        // ----- 동의어 대표 키워드 처리 -----
        label = displayLabel;
        type = 'synonym';
        count = repCountSum[rep] || valueMap[rep] || 0;
        const foundGrp = mergedGroups.find((mg)=>mg.keywords.includes(kw));
        contributors = foundGrp ? [...foundGrp.keywords] : [kw];
        
        // 조합형 여부 확인: 대표 키워드에서 메인/동일 키워드 제거한 base가 combSet 에 존재하는지 확인
        const repMainKeyword = getMainKeywordFor(rep);
        const baseFromRep = rep.replace(repMainKeyword, '').trim();
        // combSet 체크: (1) base 형태, (2) 그룹 내 다른 키워드가 combSet 에 포함되는지
        let hasComb = false;
        const combKeysArr = Array.from(combSet);
        const repNoSpace = rep.replace(/\s+/g, '');
        const baseNoSpace = baseFromRep.replace(/\s+/g,'');

        // 1) combSet 에 정확히 존재
        if (baseFromRep && combSet.has(baseFromRep)) {
          hasComb = true;
        }
        // 2) comb 키 중에 대표키워드/베이스를 포함하는 경우 (괄호표현 등)
        if (!hasComb) {
          hasComb = combKeysArr.some(k => {
            const norm = k.replace(/\s+/g,'');
            return norm.includes(repNoSpace) || (baseNoSpace && norm.includes(baseNoSpace));
          });
        }
        // 3) 그룹 내 키워드가 combSet 에 있는 경우
        if (!hasComb && foundGrp) {
          hasComb = foundGrp.keywords.some(gkw => combSet.has(gkw) || combKeysArr.some(key=> key.includes(gkw)));
        }

        const typesSet: Set<'synonym'|'indep'|'comb'|'normal'> = new Set(['synonym']);
        if(hasComb){
          typesSet.add('comb');
          
          // 동의어+조합형 키워드의 base 키워드들을 찾아서 빈도 합산 및 제거
          const keywordsToAdd: string[] = [];
          
          // 1) 대표 키워드에서 base 키워드 찾기
          if (baseFromRep && valueMap[baseFromRep]) {
            keywordsToAdd.push(baseFromRep);
          }
          
          // 2) 동의어 그룹 내의 모든 키워드에서 base 키워드와 조합 키워드 찾기
          if (foundGrp) {
            foundGrp.keywords.forEach(groupKw => {
              const kwMainKeyword = getMainKeywordFor(groupKw);
              const baseFromGroupKw = groupKw.replace(kwMainKeyword, '').trim();
              
              // 2-1) base 키워드 추가
              if (baseFromGroupKw && valueMap[baseFromGroupKw] && !keywordsToAdd.includes(baseFromGroupKw)) {
                keywordsToAdd.push(baseFromGroupKw);
              }
              
              // 2-2) 각 동의어와 메인키워드의 조합 형태도 찾아서 추가
              // 예: "국내산"과 메인키워드 "새우" → "국내산새우" 형태 확인
              const combinationWithMain = `${baseFromGroupKw}${kwMainKeyword}`;
              const mainWithCombination = `${kwMainKeyword}${baseFromGroupKw}`;
              
              if (baseFromGroupKw) {
                // 앞쪽 조합: "국내산새우"
                if (valueMap[combinationWithMain] && !keywordsToAdd.includes(combinationWithMain)) {
                  keywordsToAdd.push(combinationWithMain);
                }
                // 뒤쪽 조합: "새우국내산" (드문 경우지만 확인)
                if (valueMap[mainWithCombination] && !keywordsToAdd.includes(mainWithCombination)) {
                  keywordsToAdd.push(mainWithCombination);
                }
              }
            });
          }
          
          // 3) 찾은 키워드들의 빈도를 합산(중복 제외)하고 즉시 skipSet에 추가
          const alreadyInGroup = new Set(foundGrp ? foundGrp.keywords : []);
          keywordsToAdd.forEach(kwToAdd => {
            if (alreadyInGroup.has(kwToAdd)) return; // 동의어 그룹에 이미 포함 → 중복 합산 방지

            count += valueMap[kwToAdd];
            pushContrib(contributors, kwToAdd);
            
            // 즉시 skipSet에 추가하여 키워드 섹션에서 제외
            skipSet.add(kwToAdd);
            mergedKeywordsSet.add(kwToAdd); // 합산된 키워드 추적
            console.log(`[Step3] "${kwToAdd}"가 mergedKeywordsSet에 추가됨`);
            
            // 조합 키워드의 경우 역방향 조합도 skipSet에 추가
            const kwMainForAdded = getMainKeywordFor(kwToAdd);
            const baseFromAdded = kwToAdd.replace(kwMainForAdded, '').trim();
            if (baseFromAdded) {
              const reverseCombo1 = `${baseFromAdded}${kwMainForAdded}`;
              const reverseCombo2 = `${kwMainForAdded}${baseFromAdded}`;
              skipSet.add(reverseCombo1);
              skipSet.add(reverseCombo2);
              mergedKeywordsSet.add(reverseCombo1);
              mergedKeywordsSet.add(reverseCombo2);
            }
            
            // 디버깅: 합산된 키워드 로그
            console.log(`[Step3] 동의어+조합형 키워드 "${label}"에 "${kwToAdd}" 합산됨 (빈도: ${valueMap[kwToAdd]})`);
          });
        }

        agg[label] = { label, types: typesSet, count, contributors: [...contributors] };
        
        // 동의어 그룹의 모든 키워드를 skipSet에 추가하여 중복 처리 방지
        if (foundGrp) {
          foundGrp.keywords.forEach(kwInGroup => {
            skipSet.add(kwInGroup);
          });
        } else {
          skipSet.add(kw);
        }
        continue;
      }
      // 조합형/일체형 매핑 확인
      else if (combMappings[kw]) {
        const mapping = combMappings[kw];
        
        // 디버깅: "꿀" 키워드 처리 경로 확인
        if (kw === '꿀') {
          console.log(`[Step3] "꿀"이 combMappings 경로로 처리됨`);
          console.log(`[Step3] mapping:`, mapping);
          console.log(`[Step3] mergedKeywordsSet.has('꿀'):`, mergedKeywordsSet.has('꿀'));
        }
        
        // 동의어 그룹에 이미 속한 키워드는 스킵 (중복 처리 방지)
        if (keywordToRep[kw]) {
          console.log(`[Step3] "${kw}"는 이미 동의어 그룹에 속해 있으므로 combMappings 처리를 스킵합니다.`);
          skipSet.add(kw);
          continue;
        }
        
        // baseKeyword가 이미 동의어 그룹에 포함되어 있을 경우(=이미 표시되었음) 중복 표시를 방지하기 위해 스킵
        if (keywordToRep[mapping.baseKeyword]) {
          // 동의어 대표 키워드 라벨은 앞서 집계되었으므로, 현재 키워드를 건너뛰고 skipSet 에 추가
          skipSet.add(mapping.baseKeyword);
          skipSet.add(mapping.fullKeyword);
          skipSet.add(kw);
          continue;
        }
        
        // 합산된 키워드인 경우 스킵
        if (mergedKeywordsSet.has(kw) || mergedKeywordsSet.has(mapping.baseKeyword) || mergedKeywordsSet.has(mapping.fullKeyword)) {
          console.log(`[Step3] combMappings에서 합산된 키워드 "${kw}" 스킵됨`);
          skipSet.add(mapping.baseKeyword);
          skipSet.add(mapping.fullKeyword);
          skipSet.add(kw);
          continue;
        }
        // 일체형 키워드(label: 메인 키워드를 포함한 긴 형태로 표시)
        if (mapping.type === 'indep') {
          label = mapping.fullKeyword; // ex) "밤고구마"
        } else {
          label = mapping.baseKeyword; // 조합형은 짧은 형태 유지
        }
        type = mapping.type;
        
        // 같은 label을 가진 항목이 이미 있다면 합산
        if (agg[label]) {
          // 이미 집계된 라벨에 변형 키워드 빈도만 추가
          agg[label].count += count;
          agg[label].types.add(type);
          // 변형 키워드만 contributors 에 추가 (base/full 중복 방지)
          pushContrib(agg[label].contributors, kw);
          // 매핑된 다른 키워드들도 스킵 처리
          skipSet.add(mapping.baseKeyword);
          skipSet.add(mapping.fullKeyword);
          skipSet.add(kw);
          // combMappings 경로에서도 집계가 완료되었으므로, 아래 공통 집계를 건너뜁니다.
          continue;
        } else {
          // 새로운 항목 생성하고 관련 키워드들의 빈도 합산
          let totalCount = count;
          
          // 조합형의 경우: 기본 키워드와 조합 형태 키워드 빈도 합산
          if (type === 'comb') {
            if (mapping.baseKeyword !== kw && valueMap[mapping.baseKeyword]) {
              totalCount += valueMap[mapping.baseKeyword];
              pushContrib(contributors, mapping.baseKeyword);
            }
            if (mapping.fullKeyword !== kw && valueMap[mapping.fullKeyword]) {
              totalCount += valueMap[mapping.fullKeyword];
              pushContrib(contributors, mapping.fullKeyword);
            }
          }
          // 일체형의 경우: 기본 키워드와 메인키워드 결합 형태 빈도 합산
          else if (type === 'indep') {
            if (mapping.baseKeyword !== kw && valueMap[mapping.baseKeyword]) {
              totalCount += valueMap[mapping.baseKeyword];
              pushContrib(contributors, mapping.baseKeyword);
            }
            if (mapping.fullKeyword !== kw && valueMap[mapping.fullKeyword]) {
              totalCount += valueMap[mapping.fullKeyword];
              pushContrib(contributors, mapping.fullKeyword);
            }
          }
          
          agg[label] = { label, types: new Set([type]), count: totalCount, contributors: contributors };
          // 중복 집계를 방지하기 위해 처리한 키워드를 skip 목록에 추가
          skipSet.add(mapping.baseKeyword);
          skipSet.add(mapping.fullKeyword);
          skipSet.add(kw);
        }
      }
      // 일체형 키워드 직접 처리
      else if (independentSet.has(kw)) {
        // 합산된 키워드인 경우 스킵
        if (mergedKeywordsSet.has(kw)) {
          skipSet.add(kw);
          continue;
        }
        
        type = 'indep';
        const stripped = stripParen(kw);
        const kwMainKeyword = getMainKeywordFor(kw);
        if (stripped.includes(kwMainKeyword)) {
          label = stripped; // 이미 메인키워드 포함
        } else {
          label = `${stripped}${kwMainKeyword}`;
        }
      }
      // 조합형 키워드 직접 처리  
      else if (combSet.has(kw)) {
        // 동의어 그룹에 이미 속한 키워드는 스킵 (중복 처리 방지)
        if (keywordToRep[kw]) {
          console.log(`[Step3] "${kw}"는 이미 동의어 그룹에 속해 있으므로 조합형 직접 처리를 스킵합니다.`);
          skipSet.add(kw);
          continue;
        }
        
        // 합산된 키워드인 경우 스킵
        if (mergedKeywordsSet.has(kw)) {
          console.log(`[Step3] 조합형 키워드 "${kw}"가 합산되어 스킵됨`);
          skipSet.add(kw);
          continue;
        }
        
        // synonymCombBaseKeywords에 포함된 키워드인 경우 스킵
        if (synonymCombBaseKeywords.has(kw)) {
          console.log(`[Step3] 조합형 키워드 "${kw}"가 synonymCombBaseKeywords에 포함되어 스킵됨`);
          skipSet.add(kw);
          continue;
        }
        
        type = 'comb';
        const kwMainKeyword = getMainKeywordFor(kw);
        const stripped = kw.replace(kwMainKeyword, '').trim();
        label = stripped || kw;
      }

      // 최종 집계에 추가 (combMappings 경로는 이미 집계했으므로 제외)
      if (!combMappings[kw]) {
        // 동의어 그룹에 이미 속한 키워드는 스킵 (중복 처리 방지)
        if (keywordToRep[kw]) {
          console.log(`[Step3] "${kw}"는 이미 동의어 그룹에 속해 있으므로 일반 키워드 처리를 스킵합니다.`);
          skipSet.add(kw);
          continue;
        }
        
        // 합산된 키워드인 경우 스킵
        if (mergedKeywordsSet.has(kw)) {
          console.log(`[Step3] 일반 키워드 "${kw}"가 합산되어 스킵됨`);
          skipSet.add(kw);
          continue;
        }
        
        // synonymCombBaseKeywords에 포함된 키워드인 경우 스킵
        if (synonymCombBaseKeywords.has(kw)) {
          console.log(`[Step3] 일반 키워드 "${kw}"가 synonymCombBaseKeywords에 포함되어 스킵됨`);
          skipSet.add(kw);
          continue;
        }
        
        // 디버깅: "꿀" 키워드 처리 확인
        if (kw === '꿀') {
          console.log(`[Step3] "꿀" 일반 키워드 처리됨 (label: ${label}, type: ${type})`);
          console.log(`[Step3] mergedKeywordsSet.has('꿀'):`, mergedKeywordsSet.has('꿀'));
          console.log(`[Step3] combMappings['꿀']:`, combMappings['꿀']);
        }
        
        if (agg[label]) {
          agg[label].count += count;
          agg[label].types.add(type);
          contributors.forEach(c=>pushContrib(agg[label].contributors,c));
        } else {
          agg[label] = { label, types: new Set([type]), count, contributors: [...contributors] };
        }
      }

      // 현재 키워드 중복 처리 방지
      skipSet.add(kw);
    }

    const arr: DisplayKeywordInfo[] = Object.values(agg).map(item=>{
      // determine display type: synonym priority over indep over comb
      let displayType: 'synonym'|'indep'|'comb'|'normal'='normal';
      if(item.types.has('synonym')) displayType='synonym';
      else if(item.types.has('indep')) displayType='indep';
      else if(item.types.has('comb')) displayType='comb';
      // --- [동의어 + 조합형 대표 키워드 처리] ---
      // 동의어이면서 조합형 키워드인 경우, 대표 키워드에 메인 키워드(또는 동일 키워드)가 포함되어 있다면 제거해서 표시합니다.
      let displayLabel = item.label;
      const isSynAndComb = item.types?.has && item.types.has('synonym') && item.types.has('comb');
      if (isSynAndComb) {
        // 해당 키워드 그룹에 속한 키워드들의 실제 매핑된 메인키워드들을 수집
        const mainKeywordsToRemove = new Set<string>();
        
        // 1) 기본 메인키워드들 추가
        mainKeywordsToRemove.add(selectedMain || ctxMainKeyword || "");
        excludedSame.forEach(kw => mainKeywordsToRemove.add(kw));
        
        // 2) contributors에서 각 키워드의 실제 매핑된 메인키워드 찾아서 추가
        item.contributors.forEach(contributorKw => {
          const actualMainForKeyword = getMainKeywordFor(contributorKw);
          if (actualMainForKeyword) {
            mainKeywordsToRemove.add(actualMainForKeyword);
          }
        });
        
        // 3) 수집된 메인키워드들을 제거
        Array.from(mainKeywordsToRemove).forEach((mainKw)=>{
          if(!mainKw) return;
          // 모든 공백을 제거한 형태와 원본 두 가지 모두 시도하여 치환 정확도 향상
          const patterns = [mainKw, mainKw.replace(/\s+/g, '')];
          patterns.forEach((pat)=>{
            if(pat){
              const reg = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              displayLabel = displayLabel.replace(reg, '');
            }
          });
        });
        // 여분의 공백/쉼표/괄호 정리
        displayLabel = displayLabel.replace(/\s+/g, ' ').replace(/,{2,}/g, ',').replace(/\(=\s*,?/g, '(=').trim();
        if(displayLabel==='') displayLabel = item.label; // 보정 실패 시 원본 유지
      }

      const contrObj: ContributorInfo[] = item.contributors.map(kw=>({ kw, count:valueMap[kw]||0 }));
      return { label:displayLabel, type:displayType, types:item.types, count:item.count, contributors:contrObj };
    }).sort((a,b)=>b.count-a.count);
    
    // 디버깅: mergedKeywordsSet과 combSet 내용 출력
    console.log('[Step3] mergedKeywordsSet 내용:', Array.from(mergedKeywordsSet));
    console.log('[Step3] combSet 내용:', Array.from(combSet));
    console.log('[Step3] synonymCombBaseKeywords 내용:', Array.from(synonymCombBaseKeywords));
    
    return arr;
  }, [keywordsArray, synonymGroups, combResult, ctxMainKeyword, combMainMap, selectedMain, excludedSame]);

  // ===== 키워드 정렬 =====
  // 1) 전체 목록 정렬 (count desc, tie → label asc)
  const sortedKeywordsAll = useMemo(
    () =>
      displayKeywordsInfo
        .map(({ label, type, types, count }) => ({ label, type, types, count }))
        .sort((a, b) => (b.count === a.count ? a.label.localeCompare(b.label) : b.count - a.count)),
    [displayKeywordsInfo]
  );

  // 2) 기본 표시용 필터 (빈도 제한 없음)
  const sortedKeywordsFiltered = useMemo(
    () => sortedKeywordsAll,
    [sortedKeywordsAll]
  );

  // assign to placeholder for external handlers
  displayKeywordsCurrent = isNewAnalysisResult ? step1StyleKeywords : sortedKeywordsFiltered;

  // collapsed 길이 계산용 배열
  const visibleKeywords = isNewAnalysisResult ? step1StyleKeywords : sortedKeywordsFiltered;

  // ----- 12위(+동점) 길이 계산 -----
  const collapsedKeywordLen = useMemo(() => {
    if (visibleKeywords.length <= 12) return visibleKeywords.length;
    const threshold = visibleKeywords[11].count;
    const idx = visibleKeywords.findIndex((k: any) => k.count < threshold);
    return idx === -1 ? visibleKeywords.length : idx;
  }, [visibleKeywords]);

  // 2) 태그 원본 및 필터
  const allTagsOriginal = useMemo(
    () => [...tagsArray].sort((a: any, b: any) => b.value - a.value),
    [tagsArray]
  );
  const visibleTags = useMemo(() => allTagsOriginal, [allTagsOriginal]);

  const tagThreshold =
    visibleTags.length >= 12
      ? visibleTags[11].value
      : visibleTags[visibleTags.length - 1]?.value ?? 0;
  const collapsedTagLen =
    visibleTags.findIndex((t) => t.value < tagThreshold) === -1
      ? visibleTags.length
      : visibleTags.findIndex((t) => t.value < tagThreshold);

  // 레거시 변수 호환
  const allTags = visibleTags;
  const topTags = allTags;
  const lastTieIdxTag = collapsedTagLen - 1;

  // ----- 디버깅: 콘솔에 합산 결과 출력 -----
  useEffect(() => {
    console.log('[Step3Generate] Aggregated displayKeywords', displayKeywordsInfo);
  }, [displayKeywordsInfo]);

  useEffect(() => {
    console.log('[Step3Generate] topKeywordCounts', topKeywordCounts);
  }, [topKeywordCounts]);

  useEffect(() => {
    console.log('[Step3Generate] topTags', topTags);
  }, [topTags]);

  // ===== 추천 태그 계산 (전역 표시용) =====
  const recommendedTags = useMemo(() => {
    const topTagArr: string[] = [];
    const extraKeywordArr: string[] = [];

    // 1) 상위 태그 12개 → topTagArr (동점 제외하고 정확히 12개만)
    allTags
      .slice(0, 12)
      .forEach((t: any) => {
        if(!topTagArr.includes(t.key)) topTagArr.push(t.key);
      });

    // 2) 상위 키워드(12위+동점) 중 상품명에 아직 사용되지 않은 키워드 → extraKeywordArr
    if (genName) {
      const nameLower = genName.toLowerCase();
      
      // 동의어 그룹에서 대표 키워드가 상품명에 사용되었는지 확인하는 함수
      const isSynonymGroupUsed = (item: any) => {
        if (item.types?.has('synonym')) {
          // 동의어 키워드인 경우, 대표 키워드가 상품명에 포함되어 있는지 확인
          const mainKeyword = item.label.split('(=')[0].trim(); // "왕(=대하)" -> "왕"
          return nameLower.includes(mainKeyword.toLowerCase());
        }
        return false;
      };
      
      displayKeywordsCurrent.slice(0, collapsedKeywordLen).forEach((item) => {
        // 동의어 그룹의 대표 키워드가 이미 상품명에 사용되었으면 포함 키워드들도 제외
        if (isSynonymGroupUsed(item)) {
          return; // 이 키워드는 추천 태그에서 제외
        }
        
        if (!nameLower.includes(item.label.toLowerCase())) {
          let keywordToAdd = item.label;
          
          // 조합형 키워드인 경우 원본 키워드를 찾아서 사용
          if (item.type === 'comb') {
            // 조합형 키워드의 원본을 찾기 위해 combResult와 combMainMap 사용
            const combKeyword = Object.keys(combResult).find(kw => {
              const mainForKw = combMainMap[kw] || selectedMain || ctxMainKeyword;
              const stripped = kw.replace(mainForKw, '').trim();
              return stripped === item.label || kw === item.label;
            });
            
            if (combKeyword) {
              // 원본 키워드 사용 (메인키워드 포함된 형태)
              keywordToAdd = combKeyword;
            }
          }
          
          if(!extraKeywordArr.includes(keywordToAdd)) extraKeywordArr.push(keywordToAdd);
        }
      });
    }

    // 변환은 topTagArr 에만 적용 (조합형이면 메인 붙이기), extraKeywordArr 는 그대로 사용
    const transformedTopTags = topTagArr.map((tg)=>{
      const mainForTag = (combMainMap[tg] || selectedMain || ctxMainKeyword).replace(/\s+/g, "");
      if (combResult[tg] === '조합형' && !tg.includes(mainForTag)) {
        return `${tg}${mainForTag}`;
      }
      return tg;
    });

    return Array.from(new Set([...transformedTopTags, ...extraKeywordArr]));
  }, [allTags, collapsedTagLen, genName, displayKeywordsCurrent, collapsedKeywordLen, combResult, selectedMain, ctxMainKeyword, combMainMap]);

  // ===== 상품 주요 정보 (속성/특성) =====
  const attributePairs: any[] = categoryData?.pairedData || [];

  // 1단계 없이 접근 시는 이제 제거 (3단계에서 직접 분석 가능하므로)

  // 선택된 카테고리와 무관하게 전체 카테고리 상위 목록 (표시용)
  const topCategories = (() => {
    // 전체 카테고리가 선택된 경우 가장 빈도가 높은 1개만 표시
    if (selectedCategoryIndex === -1 || (categoryData && categoryData.categoryPath === "전체 카테고리")) {
      return sortedCategoriesDetailed.length > 0 
        ? [{
            key: sortedCategoriesDetailed[0].categoryName || sortedCategoriesDetailed[0].categoryPath || '', 
            value: sortedCategoriesDetailed[0].count || 0 
          }]
        : [];
    }
    
    // 개별 카테고리가 선택된 경우
    if (categoryData) {
      return [{ key: categoryData.categoryPath, value: categoryData.count }];
    }
    
    // fallback
    return (analysisData?.categories || []).slice(0, 12);
  })();

  // ===== 제외 키워드/태그 집계 =====
  const excludedSameAgg = useMemo(() => {
    // 메인키워드와 동의어 키워드들을 합산하여 표시
    const mergedSame: Array<{key: string, value: number}> = [];
    
    // 기존 제외 키워드들 추가
    excludedSame.forEach(kw => {
      if (typeof kw === 'string') {
        mergedSame.push({ key: kw, value: 1 });
      } else {
        mergedSame.push(kw);
      }
    });
    
    // 모든 메인키워드들
    const allMainKeywords = new Set([
      ctxMainKeyword || "",
      selectedMain || ctxMainKeyword || "",
      ...excludedSame
    ]);

    // valueMap 생성 (키워드 빈도 조회용)
    const valueMap: Record<string, number> = {};
    keywordsArray.forEach((it: any) => {
      valueMap[it.key] = it.value;
    });
    
    // 메인키워드와 동의어로 판단된 그룹들을 각각 처리
    synonymGroups.forEach(group => {
      if (group.merged && group.keywords.some(kw => allMainKeywords.has(kw))) {
        // 이 그룹에서 실제 메인키워드 찾기 (allMainKeywords에 포함된 키워드)
        const groupMainKeyword = group.keywords.find(kw => allMainKeywords.has(kw));
        
        if (groupMainKeyword) {
          // 메인키워드가 아닌 동의어들
          const synonyms = group.keywords.filter(kw => kw !== groupMainKeyword);
          
          // 총 빈도수 계산 (동의어들의 빈도만 합산)
          const totalSynonymCount = synonyms.reduce((sum, kw) => sum + (valueMap[kw] || 0), 0);
          
                     if (totalSynonymCount > 0) {
             const displayLabel = synonyms.length > 0 
               ? `${synonyms.join(', ')}(=${groupMainKeyword})`
               : synonyms[0] || groupMainKeyword;
             
             mergedSame.push({
               key: displayLabel,
               value: totalSynonymCount
             });
           }
        }
      }
    });
    
    return aggregate(mergedSame);
  }, [excludedSame, synonymGroups, selectedMain, ctxMainKeyword, keywordsArray]);
  const excludedNumbersAgg = useMemo(() => aggregate(excludedNumbersArr), [excludedNumbersArr]);
  const excludedBrandsAgg = useMemo(() => aggregate(excludedBrandsArr), [excludedBrandsArr]);
  const excludedTagsAgg = useMemo(() => aggregate(excludedTagsArr), [excludedTagsArr]);

  return (
    <div className="w-full max-w-none px-0 space-y-10">
      {/* ===== 검색 섹션 (Step1에서 가져온 것) ===== */}
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
                페이지 숫자를 입력해주세요.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 메인 키워드 카드 */}
        <Card className="border-2 border-blue-100 shadow-lg flex-1">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-xl">
              <Search className="h-5 w-5 text-blue-600" />
              <span>상품 메인 키워드 입력</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-row gap-4 items-center">
              <Input
                placeholder="최적화할 상품의 메인 키워드를 입력하세요 (예: 고구마, 모자)"
                value={productName}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductName(val);
                  setMainKeyword(val);

                  // 새 입력이 이전 분석 키워드와 다르면 기존 데이터 초기화
                  if (val !== analysisKeyword) {
                    setAnalysisData(undefined);
                    setCtxAnalysisData(undefined as any);
                    setAnalysisKeyword("");
                    setSelectedCategoryIndex(0);
                  }
                }}
                onKeyDown={handleKeyPress}
                className="flex-1 w-full min-w-0 text-lg py-6 border-2 border-gray-200 focus:border-blue-400 transition-colors"
              />
              <Button
                onClick={handleOptimize}
                disabled={!productName.trim() || isOptimizing}
                className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold border-2 border-blue-600"
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

      {usageLimitMessage && (
        <div className="max-w-4xl mx-auto mt-4">
          <div className="border-2 border-red-200 bg-red-50 rounded-md shadow-sm px-4 py-3 mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-red-700">
              {usageLimitMessage}
            </p>
            <Link 
              href="/membership" 
              className="inline-flex items-center px-2 py-1 text-xs font-normal text-red-600 hover:text-blue-600 border border-red-300 hover:border-blue-300 rounded transition-all duration-200 ml-2"
            >
              부스터멤버십으로 사용량 걱정없이 쓰기!
            </Link>
          </div>
        </div>
      )}

      {/* 히스토리 컨테이너 */}
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
              }
              
              // 완벽한 상품명 최적화 히스토리 데이터 복원
              if (historyItem?.completeOptimizerData) {
                try {
                  const { step2Data, step3Data } = historyItem.completeOptimizerData;
                  
                  if (step2Data) {
                    setSynonymGroups(step2Data.synonymGroups || []);
                    setCombResult(step2Data.combResult || {});
                    setSelectedMain(step2Data.selectedMain || selectedKeyword);
                    if((step2Data as any).combMainMap){
                      setCombMainMap((step2Data as any).combMainMap);
                    }
                  }
                  
                  if (step3Data) {
                    setGeneratedProductNames(step3Data.productNames || []);
                    setGeneratedReason(step3Data.reason || "");
                    setGeneratedTags(step3Data.tags || []);
                    setGeneratedCategories(step3Data.categories || []);
                  }
                } catch (error) {
                  console.error("[Step3] 히스토리 복원 실패:", error);
                }
              }
            }}
          />
        )}
      </div>

      {/* ===== Step1 스타일 분석 결과 (새로운 분석일 때) ===== */}
      {isNewAnalysisResult && (
        <div className="space-y-8 w-full">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">
            분석 결과
          </h2>

          {/* 카테고리 캐러셀 */}
          {shouldShowCarousel && currentCategory && (
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
                  ({currentCatIdx + 1}/{categoriesDetailed.length})
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
            {/* 카테고리 (요약) */}
            {!currentCategory && analysisData?.categories && (
              <Card className="flex-1 min-w-0 w-full">
                <CardHeader>
                  <CardTitle>
                    <span className="flex items-center gap-2">
                      <Target className="text-blue-500" /> 카테고리
                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm font-medium">
                        {analysisData.categories.length}개
                      </span>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-blue-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">카테고리</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {analysisData.categories.slice(0, 12).map((c: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : 12}</span></td>
                            <td className="px-4 py-2">{c.key}</td>
                            <td className="px-4 py-2">{c.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

                         {/* 키워드 (전체) */}
             {analysisData?.keywords && (
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
                           <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                           <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">키워드</th>
                           <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                         </tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-gray-100">
                         {(showAllKeywords ? sortedKeywords : topKeywordsWithTies).map((c: any, idx: number) => (
                           <React.Fragment key={`keyword-${idx}`}>
                             <tr>
                               <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxKeywordStep1 ? 12 : idx + 1)}</span></td>
                               <td className="px-4 py-2">{c.key}</td>
                               <td className="px-4 py-2">{c.value}</td>
                             </tr>
                             {showAllKeywords && idx === lastTieIdxKeywordStep1 && (
                               <tr key="collapse-keywords-step1">
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

             {/* 키워드 개수 */}
             {analysisData && (
               <Card className="flex-1 min-w-0 w-full">
                 <CardHeader>
                   <CardTitle>
                     <span className="flex items-center gap-2">
                       <ListOrdered className="text-yellow-500" /> 키워드 개수
                       <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-sm font-medium">
                         {allKeywordCounts.reduce((acc: number, k: any) => acc + (k.value || 0), 0)}개
                       </span>
                     </span>
                   </CardTitle>
                   <p className="text-sm text-gray-500 mt-1">현재 페이지에서 상위 40개 상품명 분석</p>
                 </CardHeader>
                 <CardContent>
                   <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
                     <ReactWordcloud
                       words={allKeywordCounts
                         .sort((a, b) => (b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value))
                         .slice(0, collapsedKeywordCntLen)
                         .map((it:any) => ({ text: `${it.key}개`, value: it.value }))}
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
                           <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                           <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">키워드수</th>
                           <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                         </tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-gray-100">
                         {(showAllKeywordCounts ? allKeywordCounts : allKeywordCounts.slice(0, collapsedKeywordCntLen)).map((k:any, idx:number) => (
                           <React.Fragment key={`kcnt-step1-${idx}`}>
                             <tr> 
                               <td className="px-4 py-2">
                                 <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= collapsedKeywordCntLen-1 ? 12 : idx + 1)}</span>
                               </td>
                               <td className="px-4 py-2">{k.key}</td>
                               <td className="px-4 py-2">{k.value}</td>
                             </tr>
                             {showAllKeywordCounts && idx === collapsedKeywordCntLen -1 && (
                               <tr key="collapse-kcnt-step1">
                                 <td colSpan={3} className="px-4 py-2">
                                   <div className="flex justify-end">
                                     <button onClick={()=>setShowAllKeywordCounts(false)} className="text-yellow-600 text-xs flex items-center gap-1">
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
             {analysisData?.tags && (
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
                           <React.Fragment key={`tag-step1-${idx}`}>
                             <tr>
                               <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= lastTieIdxTagStep1 ? 12 : idx + 1)}</span></td>
                               <td className="px-4 py-2 truncate max-w-xs">{c.key}</td>
                               <td className="px-4 py-2">{c.value}</td>
                             </tr>
                             {showAllTags && idx=== lastTieIdxTagStep1 && (
                               <tr key="collapse-tags-step1">
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
           <div className="flex justify-center mt-8">
             <Button className="px-6" onClick={handleNext}>
               다음 단계로
             </Button>
           </div>
        </div>
      )}

      {/* ===== 상품명 생성 및 추천 영역 (기존 결과가 있을 때만) ===== */}
      {hasExistingResults && analysisData && productName.trim() === analysisKeyword && (
      <Card className="mb-8 border-2 border-indigo-500/30 shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-indigo-500 w-5 h-5" />
            {isMobile ? (
              <span>상위노출 상품명, 태그<br/>제안</span>
            ) : (
              <span>상위노출 상품명, 태그 제안</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 버튼 – 항상 표시 */}
          {/* {usageLimitMessage && (
            <div className="max-w-2xl mx-auto w-full">
              <div className="border-2 border-red-200 bg-red-50 rounded-md shadow-sm px-4 py-3 mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-red-700">
                  {usageLimitMessage}
                </p>
                <Link 
                  href="/membership" 
                  className="inline-flex items-center px-2 py-1 text-xs font-normal text-red-600 hover:text-blue-600 border border-red-300 hover:border-blue-300 rounded transition-all duration-200 ml-2"
                >
                  부스터멤버십으로 사용량 걱정없이 쓰기!
                </Link>
              </div>
            </div>
          )} */}
          <div className="flex justify-center">
            <Button onClick={handleGenerate} disabled={genLoading || genDisabled}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold flex items-center gap-2">
              {genLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" />
                  <span>생성 중...</span>
                </>
              ) : genDisabled ? (
                <>
                  <Sparkles className="w-5 h-5" /> 잠시 후에 사용 가능해요...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" /> 상품명, 태그 생성하기
                </>
              )}
            </Button>
          </div>

          {/* 결과 & 추천 레이아웃 */}
          {genName && (
            <div className="grid md:grid-cols-2 gap-8">
              {/* 왼쪽 영역 */}
              <div className="space-y-6">
                {/* 상품명 */}
                <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2">
                  <h4 className="font-semibold text-base flex items-center gap-1"><Sparkles className="w-5 h-5 text-indigo-500"/> 생성된 상품명</h4>
                  <div className="flex items-start gap-2">
                    <p className="text-lg text-blue-700 font-bold break-words whitespace-pre-wrap leading-relaxed flex-1">{genName}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(genName);
                        trackEvent('Copy', 'complete_product_name');
                      }}
                      className="border-blue-600 text-blue-600 hover:bg-blue-50 shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'Pretendard' }}>
                    브랜드, 용량, 시리즈 등의 키워드는 판매 상품에 맞는 키워드로 변경해 활용하세요
                  </p>
                </div>

                {/* 추천 태그 */}
                <div className="border rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-base flex items-center gap-1"><Hash className="w-5 h-5 text-pink-500"/> 추천 태그</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(recommendedTags.join(', '));
                        trackEvent('Copy', 'complete_tags');
                      }}
                      className="border-blue-600 text-blue-600 hover:bg-blue-50"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recommendedTags.map((tg, idx) => (
                      <span key={`rtag-${idx}`} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium whitespace-nowrap">{tg}</span>
                    ))}
                  </div>
                </div>

                {/* 추천 카테고리 */}
                <div className="border rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-base flex items-center gap-1"><Layers className="w-5 h-5 text-blue-500"/> 추천 카테고리</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(topCategories.slice(0, 6).map((c: any) => c.key).join(', '));
                        trackEvent('Copy', 'complete_categories');
                      }}
                      className="border-blue-600 text-blue-600 hover:bg-blue-50"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {topCategories.slice(0, 6).map((c: any, idx: number) => (
                      <span key={`rcat-${idx}`} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium whitespace-nowrap">{c.key}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 오른쪽 영역 - 최적화 이유 */}
              <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2 h-fit">
                <h4 className="font-semibold text-base flex items-center gap-1"><ListOrdered className="w-5 h-5 text-yellow-500"/> 최적화 이유</h4>
                <pre className="whitespace-pre-wrap leading-relaxed text-gray-700" style={{ fontFamily: 'Pretendard' }}>{genReason?.replace(/\n{3,}/g, '\n\n')}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ===== 기존 상세 카드 영역 (기존 결과가 있을 때만) ===== */}
      {hasExistingResults && analysisData && productName.trim() === analysisKeyword && (
      <>
      {/* 카테고리 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="text-blue-500 w-5 h-5" /> 카테고리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {topCategories.map((c: any, idx: number) => (
              <li key={`cat-${idx}`} className="flex justify-between">
                <span className="font-medium truncate max-w-xs">
                  <span className="text-gray-400 mr-1">{idx+1}.</span>{c.key}
                </span>
                <span className="text-gray-500">{c.value}회</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-8">
        {/* 상위 키워드 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="text-indigo-500 w-5 h-5" /> 상위 키워드
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Wordcloud */}
            <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
              <ReactWordcloud
                words={sortedKeywordsFiltered.slice(0, collapsedKeywordLen)
                  .map((it) => ({ text: it.label, value: it.count }))}
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

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-indigo-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">키워드</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {(showAllKeywords ? sortedKeywordsAll : sortedKeywordsFiltered.slice(0, collapsedKeywordLen)).map((item, idx) => (
                    <React.Fragment key={`kw-row-${idx}`}>
                      <tr
                        className={
                          item.types?.has('synonym')
                            ? 'text-blue-700'
                            : item.types?.has('indep')
                             ? 'text-orange-600'
                             : item.types?.has('comb')
                              ? 'text-green-600'
                              : ''
                        }
                      >
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">
                            {idx < 12 ? idx + 1 : (idx <= collapsedKeywordLen-1 ? 12 : idx + 1)}
                          </span>
                        </td>
                        <td className="px-4 py-2 flex items-center gap-2">
                          <span className="break-words flex-1">
                            {item.types?.has('synonym') && item.types?.has('comb') && item.label.includes('(=') 
                              ? (() => {
                                  const parts = item.label.split('(=');
                                  return (
                                    <span>
                                      {parts[0]}
                                      <br />
                                      (={parts[1]}
                                    </span>
                                  );
                                })()
                              : item.label
                            }
                          </span>
                          {item.types?.has('synonym') && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">동의어</span>
                          )}
                          {item.types?.has('indep') && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">일체형</span>
                          )}
                          {item.types?.has('comb') && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">조합형</span>
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">{item.count}</td>
                      </tr>
                      {showAllKeywords && idx === collapsedKeywordLen -1 && (
                        <tr key="collapse-kw-bottom">
                          <td colSpan={3} className="px-4 py-2">
                            <div className="flex justify-end">
                              <button onClick={()=>setShowAllKeywords(false)} className="text-blue-500 text-xs flex items-center gap-1">
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
              <div className="space-y-2 text-xs pt-4">
                {excludedSameAgg.length > 0 && (
                  <div className="my-2">
                    <span className="font-semibold mr-2 text-sm">입력 키워드와 동일 키워드:</span>
                    <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {excludedSameAgg.map((txt, i) => (
                          <span 
                            key={i} 
                            className="inline-block px-1.5 py-0.5 bg-gray-200 text-xs rounded text-gray-700 select-none pointer-events-none"
                            style={{ fontSize: '12px' }}
                          >
                            {txt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {excludedNumbersAgg.length > 0 && (
                  <div className="my-2">
                    <span className="font-semibold mr-2 text-sm">제외 숫자 키워드:</span>
                    <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {excludedNumbersAgg.map((txt, i) => (
                          <span 
                            key={i} 
                            className="inline-block px-1.5 py-0.5 bg-gray-200 text-xs rounded text-gray-700 select-none pointer-events-none"
                            style={{ fontSize: '12px' }}
                          >
                            {txt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {excludedBrandsAgg.length > 0 && (
                  <div className="my-2">
                    <span className="font-semibold mr-2 text-sm">제외 브랜드 키워드:</span>
                    <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {excludedBrandsAgg.map((txt, i) => (
                          <span 
                            key={i} 
                            className="inline-block px-1.5 py-0.5 bg-gray-200 text-xs rounded text-gray-700 select-none pointer-events-none"
                            style={{ fontSize: '12px' }}
                          >
                            {txt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 키워드 개수 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="text-yellow-500 w-5 h-5" /> 키워드 개수
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Wordcloud */}
            <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
              <ReactWordcloud
                words={allKeywordCounts
                  .sort((a, b) => (b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value))
                  .slice(0, collapsedKeywordCntLen)
                  .map((it:any) => ({ text: `${it.key}개`, value: it.value }))}
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

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-yellow-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">키워드수</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">빈도</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {(showAllKeywordCounts ? allKeywordCounts : allKeywordCounts.slice(0, collapsedKeywordCntLen)).map((k:any, idx:number) => (
                    <React.Fragment key={`kcnt-${idx}`}>
                      <tr> 
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= collapsedKeywordCntLen-1 ? 12 : idx + 1)}</span>
                        </td>
                        <td className="px-4 py-2">{k.key}</td>
                        <td className="px-4 py-2">{k.value}</td>
                      </tr>
                      {showAllKeywordCounts && idx === collapsedKeywordCntLen -1 && (
                        <tr key="collapse-kcnt-bottom"><td colSpan={3} className="px-4 py-2"><div className="flex justify-end"><button onClick={()=>setShowAllKeywordCounts(false)} className="text-yellow-600 text-xs flex items-center gap-1">접기 <ChevronUp className="w-3 h-3" /></button></div></td></tr>
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

        {/* 상위 태그 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="text-pink-500 w-5 h-5" /> 태그
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Wordcloud */}
            <div className="mb-4 w-full min-w-0 overflow-x-auto" style={{ height: 260 }}>
              <ReactWordcloud
                words={visibleTags
                  .sort((a:any,b:any)=> b.value - a.value)
                  .slice(0, collapsedTagLen)
                  .map((it:any)=>({ text: it.key, value: it.value }))}
                options={{
                  fontSizes: [12, 45],
                  rotations: 2,
                  rotationAngles: [0, 0],
                  deterministic: true,
                  colors: [
                    "#fbcfe8",
                    "#f9a8d4",
                    "#fca5a5",
                    "#a5b4fc",
                    "#bae6fd",
                    "#bbf7d0",
                    "#fdba74",
                    "#fcd34d",
                  ],
                  enableTooltip: true,
                  scale: "sqrt",
                  spiral: "archimedean",
                  padding: 8,
                  transitionDuration: 0,
                }}
              />
            </div>

            {/* Table */}
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
                  {(showAllTags ? allTagsOriginal : visibleTags.slice(0, collapsedTagLen)).map((t:any, idx:number)=> (
                    <React.Fragment key={`tag-${idx}`}>
                      <tr>
                        <td className="px-4 py-2"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{idx < 12 ? idx + 1 : (idx <= collapsedTagLen-1 ? 12 : idx + 1)}</span></td>
                        <td className="px-4 py-2 truncate max-w-xs">{t.key}</td>
                        <td className="px-4 py-2">{t.value}</td>
                      </tr>
                      {showAllTags && idx === collapsedTagLen -1 && (
                        <tr key="collapse-tags-bottom"><td colSpan={3} className="px-4 py-2"><div className="flex justify-end"><button onClick={()=>setShowAllTags(false)} className="text-pink-500 text-xs flex items-center gap-1">접기 <ChevronUp className="w-3 h-3" /></button></div></td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end mt-2">
                <button
                  onClick={()=>setShowAllTags(!showAllTags)}
                  className="text-pink-500 text-xs flex items-center gap-1"
                >
                  {showAllTags ? (
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

              {/* 제외 태그 */}
              {excludedTagsAgg.length>0 && (
                <div className="my-2 pt-4">
                  <span className="font-semibold mr-2 text-sm">제외 태그:</span>
                  <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {excludedTagsAgg.map((txt,i)=>(
                        <span 
                          key={i} 
                          className="inline-block px-1.5 py-0.5 bg-gray-200 text-xs rounded text-gray-700 select-none pointer-events-none"
                          style={{ fontSize: '12px' }}
                        >
                          {txt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== 상품 주요 정보 (속성/특성) ===== */}
      {attributePairs.length>0 && (
        <Card className="mt-8 border border-green-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookCheck className="text-green-500 w-5 h-5" /> 상품 주요정보
            </CardTitle>
            <p className="text-sm text-gray-500">검색 노출에 도움! 상품 등록 시 참고하세요.</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">속성</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">특성</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {attributePairs.slice(0,20).map((pair:any,idx:number)=>(
                  <tr key={`attr-${idx}`}>
                    <td className="px-4 py-2 font-medium">{pair.attribute}</td>
                    <td className="px-4 py-2">{
                      (pair.characters||[]).slice(0,5).map((ch:any)=>`${ch.character}(${ch.count}회)`).join(', ')
                    }</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      </>
      )}

      {/* 기존 결과가 있을 때만 이전 단계 버튼 표시 */}
      {hasExistingResults && analysisData && productName.trim() === analysisKeyword && (
        <div className="flex justify-start mt-8">
          <Button variant="outline" onClick={onPrev}>
            이전 단계
          </Button>
        </div>
      )}

      {/* 로그인 모달 */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none">
          <LoginPage isModal={true} onLoginSuccess={() => setShowLoginModal(false)} />
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

        {/* 로봇 인증 확인 모달 */}
        <RobotVerificationDialog
          open={showRobotVerificationModal}
          onOpenChange={setShowRobotVerificationModal}
          onConfirm={activateNaverShoppingPage}
        />
      </div>
    );
  }

function aggregate(arr: (string|{key:string,value:number})[]) {
  const map: Record<string,number> = {};
  arr.forEach(it=>{
    const k = typeof it==='string'? it : it.key;
    const v = typeof it==='string'? 1  : it.value??1;
    map[k] = (map[k]||0)+v;
  });
  return Object.entries(map).map(([k,v])=>`${k}(${v}회)`);
}