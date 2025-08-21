import React, { useState, useEffect, useRef } from "react";
import { useOptimizer, AIResultData } from "@/contexts/OptimizerContext";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Sparkles, ListOrdered, Hash, Layers, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { HistoryService } from "@/lib/historyService";
import { UsageService } from "@/lib/usageService";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { sampleKeywordInput, sampleKeywordRaw, sampleAnalysisData } from "@/sample/sampleData";
import { useIsMobile } from "@/hooks/use-mobile";

interface QuickAIResultProps {
  onLimitMessage?: (msg: string | null) => void;
}

export default function QuickAIResult({ onLimitMessage }: QuickAIResultProps) {
  const { analysisData, mainKeyword, aiResult, setAiResult, selectedCategoryIndex } = useOptimizer();
  const { currentUser } = useAuth();
  const pageIndex = (analysisData as any)?._pageIndex ?? 1;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [usageLimitMessage, setUsageLimitMessage] = useState<string | null>(null);
  const hasCalledRef = useRef(false);
  const keywordsRef = useRef<string[]>([]);
  const keywordCountRef = useRef(10);
  const keywordsArrRef = useRef<any[]>([]);
  // "keyword-page" 조합을 저장하여 키워드가 같아도 페이지가 다른 경우에는 새로 호출되도록 관리
  const lastCallKeyRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  // 예시 데이터 여부 판별
  const isSample = (
    mainKeyword === sampleKeywordInput ||
    (analysisData && analysisData.keywords && Array.isArray(analysisData.keywords) &&
      analysisData.keywords.length === sampleAnalysisData.keywords?.length &&
      analysisData.keywords.every((k: any, i: number) => k.key === sampleAnalysisData.keywords[i].key && k.value === sampleAnalysisData.keywords[i].value)
    )
  );

  // propagate message to parent
  useEffect(() => {
    if (onLimitMessage) onLimitMessage(usageLimitMessage);
  }, [usageLimitMessage, onLimitMessage]);

  // 메인 키워드가 변경되면 내부 호출 상태를 항상 초기화 (중복 호출 방지 해제)
  useEffect(() => {
    hasCalledRef.current = false;
    lastCallKeyRef.current = null;
    keywordsRef.current = [];
    keywordCountRef.current = 0;
  }, [mainKeyword]);

  useEffect(() => {
    if (isSample) return; // 예시 데이터면 AI 호출하지 않음
    if (!analysisData || !mainKeyword) return;

    // 현재 호출을 식별하기 위한 키 (키워드-페이지 조합)
    const currentKey = `${mainKeyword}-${pageIndex}`;

    // 다른 키(키워드·페이지)로 변경된 경우, 중복 호출 방지 플래그를 초기화합니다.
    if (lastCallKeyRef.current !== currentKey) {
      hasCalledRef.current = false;
    }

    // 동일 키로 이미 호출 완료한 경우 중단
    if (lastCallKeyRef.current === currentKey) return;

    // AI 결과가 있고 같은 키워드와 페이지 번호인 경우 API 호출하지 않음
    if (aiResult && aiResult.keyword === mainKeyword && aiResult.pageIndex === pageIndex) return;

    // 중복 호출 방지 플래그 확인
    if (hasCalledRef.current) return;

    // 분석 데이터의 키워드와 현재 메인 키워드가 일치하는지 확인
    // _keyword가 있으면 그것과 비교, 없으면 mainKeyword 사용
    const analysisKeyword = analysisData._keyword || mainKeyword;
    if (analysisKeyword !== mainKeyword) return;

    // set immediately to prevent duplicate
    hasCalledRef.current = true;

    // 카테고리가 2개 이상이면 첫 번째 카테고리의 키워드 사용, 그렇지 않으면 전체 키워드 사용
    let keywordsArr: any[] = [];
    const hasMultipleCategories = Array.isArray(analysisData.categoriesDetailed) && analysisData.categoriesDetailed.length >= 2;
    
    console.log("[QuickAIResult] === 카테고리 분석 시작 ===");
    console.log("[QuickAIResult] analysisData.categoriesDetailed:", analysisData.categoriesDetailed);
    console.log("[QuickAIResult] categoriesDetailed 개수:", analysisData.categoriesDetailed?.length || 0);
    console.log("[QuickAIResult] hasMultipleCategories:", hasMultipleCategories);
    
    if (hasMultipleCategories) {
      // 카테고리가 2개 이상인 경우: 현재 선택된 카테고리의 키워드 사용
      const currentCategoryIndex = selectedCategoryIndex || 0;
      const selectedCategory = analysisData.categoriesDetailed[currentCategoryIndex];
      console.log("[QuickAIResult] 현재 선택된 카테고리 인덱스:", currentCategoryIndex);
      console.log("[QuickAIResult] 선택된 카테고리 데이터:", selectedCategory);
      console.log("[QuickAIResult] 선택된 카테고리의 keywords:", selectedCategory?.keywords);
      console.log("[QuickAIResult] keywords 타입:", typeof selectedCategory?.keywords);
      console.log("[QuickAIResult] keywords 배열 여부:", Array.isArray(selectedCategory?.keywords));
      
      if (selectedCategory && Array.isArray(selectedCategory.keywords)) {
        keywordsArr = selectedCategory.keywords;
        console.log("[QuickAIResult] ✅ 선택된 카테고리의 키워드 사용:", keywordsArr.length, "개");
        console.log("[QuickAIResult] 사용된 키워드들:", keywordsArr);
      } else if (selectedCategory && selectedCategory.keywords && typeof selectedCategory.keywords === 'object') {
        // 키워드가 객체 형태인 경우 배열로 변환
        keywordsArr = Object.entries(selectedCategory.keywords).map(([key, value]) => ({ key, value }));
        console.log("[QuickAIResult] ✅ 선택된 카테고리의 키워드 사용 (객체→배열):", keywordsArr.length, "개");
        console.log("[QuickAIResult] 사용된 키워드들:", keywordsArr);
      } else {
        // fallback: 전체 키워드 사용
        keywordsArr = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
        console.log("[QuickAIResult] ⚠️ fallback: 전체 키워드 사용 (선택된 카테고리에 키워드 없음)");
        console.log("[QuickAIResult] 전체 키워드:", keywordsArr.length, "개");
      }
    } else {
      // 카테고리가 1개이거나 없는 경우: 전체 키워드 사용
      keywordsArr = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
      console.log("[QuickAIResult] 카테고리가 1개이거나 없음 - 전체 키워드 사용:", keywordsArr.length, "개");
    }
    
    console.log("[QuickAIResult] === 최종 사용된 키워드 배열 ===");
    console.log("[QuickAIResult] keywordsArr 길이:", keywordsArr.length);
    console.log("[QuickAIResult] keywordsArr 내용:", keywordsArr);
    console.log("[QuickAIResult] === 카테고리 분석 끝 ===");
    
    keywordsArrRef.current = keywordsArr;

    // 상위 12위와 동점인 키워드까지 모두 포함하도록 계산
    const sortedKeywords = [...keywordsArr].sort((a, b) => (b.value || 0) - (a.value || 0));
    let topKeywordsWithTies = sortedKeywords.slice(0, 12);

    if (sortedKeywords.length > 12) {
      const thresholdValue = topKeywordsWithTies[topKeywordsWithTies.length - 1].value || 0;
      topKeywordsWithTies = sortedKeywords.filter((k) => (k.value || 0) >= thresholdValue);
    }

    // 키워드 전달
    const filteredKeywords = topKeywordsWithTies;
    keywordsRef.current = filteredKeywords.map((k) => k.key);

    // ===== 키워드 개수(상품명 어절 수) 우선순위 =====
    let keywordCount = 10; // 기본값

    // 1) 현재 선택된 카테고리의 keywordCounts 우선 사용
    let kcArr: { key: string; value: number }[] = [];
    
    // 카테고리가 선택되어 있고 keywordCounts가 있는 경우
    if (hasMultipleCategories && analysisData.categoriesDetailed) {
      const currentCategoryIndex = selectedCategoryIndex || 0;
      const selectedCategory = analysisData.categoriesDetailed[currentCategoryIndex];
      if (selectedCategory && selectedCategory.keywordCounts && typeof selectedCategory.keywordCounts === 'object') {
        kcArr = Object.entries(selectedCategory.keywordCounts as Record<string, number>).map(([k,v])=>({ key:k, value:Number(v) }));
        console.log("[QuickAIResult] ✅ 선택된 카테고리의 keywordCounts 사용:", kcArr.length, "개");
      }
    }
    
    // 2) 전체 keywordCounts 사용 (fallback)
    if (kcArr.length === 0) {
      const kcSrc = analysisData.keywordCounts;
      if (Array.isArray(kcSrc) && kcSrc.length > 0) {
        kcArr = kcSrc as any;
        console.log("[QuickAIResult] ✅ 전체 keywordCounts (배열) 사용:", kcArr.length, "개");
      } else if (kcSrc && typeof kcSrc === 'object' && Object.keys(kcSrc).length > 0) {
        kcArr = Object.entries(kcSrc as Record<string, number>).map(([k,v])=>({ key:k, value:Number(v) }));
        console.log("[QuickAIResult] ✅ 전체 keywordCounts (객체) 사용:", kcArr.length, "개");
      } else if (Array.isArray(analysisData.categoriesDetailed)) {
        // 3) 카테고리별 keywordCounts 합산 (마지막 fallback)
        const agg: Record<string, number> = {};
        analysisData.categoriesDetailed.forEach((cat: any) => {
          const obj = cat.keywordCounts;
          if (obj && typeof obj === 'object') {
            for (const [k,v] of Object.entries(obj as Record<string, number>)) {
              agg[k] = (agg[k]||0)+Number(v);
            }
          }
        });
        kcArr = Object.entries(agg).map(([k,v])=>({key:k, value:Number(v)}));
        console.log("[QuickAIResult] ✅ 카테고리별 keywordCounts 합산 사용:", kcArr.length, "개");
      }
    }

    if (kcArr.length > 0) {
      // 키워드 개수 배열 정렬: 빈도수 내림차순, 빈도수가 같으면 키워드 개수 내림차순
      console.log('[QuickAIResult] 정렬 전 kcArr:');
      kcArr.forEach((item, index) => {
        console.log(`  [${index}] key: ${item.key}, value: ${item.value}`);
      });
      
      const sortedKcArr = [...kcArr].sort((a, b) => {
        if (b.value !== a.value) {
          return b.value - a.value; // 빈도수 내림차순
        }
        return Number(b.key) - Number(a.key); // 빈도수가 같으면 키워드 개수 내림차순
      });
      
      console.log('[QuickAIResult] 정렬 후 sortedKcArr:');
      sortedKcArr.forEach((item, index) => {
        console.log(`  [${index}] key: ${item.key}, value: ${item.value}`);
      });
      
      // 정렬된 첫 번째 요소가 최적값
      keywordCount = Number(sortedKcArr[0].key);
      console.log('[QuickAIResult] 선택된 keywordCount:', keywordCount);
    }

    keywordCountRef.current = keywordCount;

    const calcRecommendedTags = (
      productName: string,
      analysis: any,
      displayKeywords: string[]
    ) => {
      // 카테고리가 2개 이상이면 첫 번째 카테고리의 태그 사용, 그렇지 않으면 전체 태그 사용
      let tagsRaw: any[] = [];
      const hasMultipleCategories = Array.isArray(analysis.categoriesDetailed) && analysis.categoriesDetailed.length >= 2;
      
      console.log("[QuickAIResult-Tags] === 태그 분석 시작 ===");
      console.log("[QuickAIResult-Tags] analysis.categoriesDetailed:", analysis.categoriesDetailed);
      console.log("[QuickAIResult-Tags] categoriesDetailed 개수:", analysis.categoriesDetailed?.length || 0);
      console.log("[QuickAIResult-Tags] hasMultipleCategories:", hasMultipleCategories);
      
      if (hasMultipleCategories) {
        // 카테고리가 2개 이상인 경우: 현재 선택된 카테고리의 태그 사용
        const currentCategoryIndex = selectedCategoryIndex || 0;
        const selectedCategory = analysis.categoriesDetailed[currentCategoryIndex];
        console.log("[QuickAIResult-Tags] 현재 선택된 카테고리 인덱스:", currentCategoryIndex);
        console.log("[QuickAIResult-Tags] 선택된 카테고리 데이터:", selectedCategory);
        console.log("[QuickAIResult-Tags] 선택된 카테고리의 tags:", selectedCategory?.tags);
        console.log("[QuickAIResult-Tags] tags 타입:", typeof selectedCategory?.tags);
        console.log("[QuickAIResult-Tags] tags 배열 여부:", Array.isArray(selectedCategory?.tags));
        
        if (selectedCategory && Array.isArray(selectedCategory.tags)) {
          tagsRaw = selectedCategory.tags;
          console.log("[QuickAIResult-Tags] ✅ 선택된 카테고리의 태그 사용 (배열):", tagsRaw.length, "개");
        } else if (selectedCategory && selectedCategory.tags && typeof selectedCategory.tags === 'object') {
          // 태그가 객체 형태인 경우 배열로 변환
          tagsRaw = Object.entries(selectedCategory.tags).map(([key, value]) => ({ key, value }));
          console.log("[QuickAIResult-Tags] ✅ 선택된 카테고리의 태그 사용 (객체→배열):", tagsRaw.length, "개");
        } else {
          // fallback: 전체 태그 사용
          tagsRaw = Array.isArray(analysis.tags) ? analysis.tags : [];
          console.log("[QuickAIResult-Tags] ⚠️ fallback: 전체 태그 사용 (선택된 카테고리에 태그 없음)");
        }
      } else {
        // 카테고리가 1개이거나 없는 경우: 전체 태그 사용
        tagsRaw = Array.isArray(analysis.tags) ? analysis.tags : [];
        console.log("[QuickAIResult-Tags] 카테고리가 1개이거나 없음 - 전체 태그 사용:", tagsRaw.length, "개");
      }
      
      console.log("[QuickAIResult-Tags] === 최종 사용된 태그 배열 ===");
      console.log("[QuickAIResult-Tags] tagsRaw 길이:", tagsRaw.length);
      console.log("[QuickAIResult-Tags] tagsRaw 내용:", tagsRaw);
      console.log("[QuickAIResult-Tags] === 태그 분석 끝 ===");
      
      const topTags = tagsRaw
        .map((t: any) => ({ key: t.key ?? t.label ?? t.tag ?? "", value: Number(t.value ?? t.count ?? 0) }))
        .filter((t) => t.key)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);

      // 1) 상위 태그 12개 추가
      const set = new Set<string>();
      topTags.forEach((t) => set.add(t.key));

      const nameLower = productName.toLowerCase();
      displayKeywords.slice(0, 12).forEach((kw) => {
        const kwStr = kw.trim();
        if (!kwStr) return;
        if (!nameLower.includes(kwStr.toLowerCase())) set.add(kwStr);
      });
      return Array.from(set);
    };

    const calcRecommendedCategories = (analysis: any) => {
      if (Array.isArray(analysis.categoriesDetailed) && analysis.categoriesDetailed.length > 0) {
        const first = analysis.categoriesDetailed[0];
        return [first.categoryName || first.categoryPath || first.name || ""];
      }
      if (Array.isArray(analysis.categories) && analysis.categories.length > 0) {
        const first = analysis.categories[0];
        return [first.key || first.categoryPath || first.name || ""];
      }
      return [];
    };

    const generate = async () => {
      setLoading(true);
      setError(false);
      try {
        const keywordStr = keywordsRef.current.join(', ');

        console.log("[QuickAIResult] === API 호출 정보 ===");
        console.log("[QuickAIResult] 메인 키워드:", mainKeyword);
        console.log("[QuickAIResult] 전송될 키워드 문자열:", keywordStr);
        console.log("[QuickAIResult] keywordsRef.current:", keywordsRef.current);
        console.log("[QuickAIResult] keywordCount:", keywordCountRef.current);
        console.log("[QuickAIResult] === API 호출 시작 ===");

        console.log("[QuickAIResult] fetch /api/generate-name", { query: mainKeyword, keyword: keywordStr, keywordCount: keywordCountRef.current });

        const resp = await fetch("/api/generate-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: mainKeyword, keyword: keywordStr, keywordCount: keywordCountRef.current }),
        });
        if (resp.ok) {
          const json = await resp.json();
          const topKeywords = keywordsRef.current;
          const tags = calcRecommendedTags(json.productName, analysisData, topKeywords);
          const cats = calcRecommendedCategories(analysisData);
          
          // Context에 AI 결과 저장
          const aiResultData: AIResultData = {
            productName: json.productName,
            reason: json.reason,
            recommendedTags: tags,
            recommendedCategories: cats,
            keyword: mainKeyword,
            pageIndex: pageIndex
          };
          setAiResult(aiResultData);
          lastCallKeyRef.current = currentKey;

          // GA4 – 생성 성공 이벤트
          trackEvent('GenerateName', 'quick_success', null, {
            keyword: mainKeyword,
            query: mainKeyword,
            pageIndex,
            keywordCount: keywordCountRef.current,
            generatedName: aiResultData.productName,
            keywords: keywordsRef.current.join(', ')
          });

          // 📌 히스토리 업데이트 바로 수행 (실패해도 무시)
          if (currentUser?.email) {
            try {
              await HistoryService.updateHistoryWithAIResult(
                currentUser.email,
                mainKeyword,
                'quick-optimizer',
                {
                  productName: aiResultData.productName,
                  reason: aiResultData.reason,
                  recommendedTags: aiResultData.recommendedTags,
                  recommendedCategories: aiResultData.recommendedCategories
                },
                pageIndex
              );
              console.log('[QuickAIResult] History updated with AI result immediately');
            } catch (err) {
              console.warn('[QuickAIResult] Failed to update history (ignored):', err);
            }
          }
        } else {
          setError(true);
          lastCallKeyRef.current = currentKey;
        }
      } catch (err) {
        console.error(err);
        setError(true);
        lastCallKeyRef.current = currentKey;
      } finally {
        setLoading(false);
      }
    };

    generate();
  }, [analysisData, mainKeyword, pageIndex, setAiResult]);

  // ----- 수동 재생성 핸들러 -----
  const handleRegenerate = async () => {
    if (loading) return;

    const hadPrevGenerated = aiResult !== null;

    // 🔒 사용량 제한 체크 – 버튼 클릭 시 즉시 확인
    if (currentUser?.email) {
      try {
        const usageLimit = await UsageService.checkProductOptimizationLimit(currentUser.email);
        if (!usageLimit.canUse) {
          const msg = `오늘 상품 최적화 사용량을 모두 사용했습니다. (${usageLimit.currentCount}/${usageLimit.maxCount})`;
          setUsageLimitMessage(msg);
          return; // 실행 중단
        }
        setUsageLimitMessage(null);
      } catch (err) {
        console.error('[Usage] Failed to check usage limit (Quick regenerate):', err);
      }
    }

    // ====== 키워드/키워드수 계산 (refs가 비어있는 경우 대비) ======
    const analysisKeyword = analysisData?._keyword || mainKeyword;

    if (keywordsRef.current.length === 0 || keywordCountRef.current === 0 || analysisKeyword !== mainKeyword) {
      if (!analysisData) {
        console.error('[QuickAIResult] analysisData missing – cannot regenerate');
        return;
      }

      // 1) 키워드 목록 계산
      // 카테고리가 2개 이상이면 첫 번째 카테고리의 키워드 사용, 그렇지 않으면 전체 키워드 사용
      let keywordsArr: any[] = [];
      const hasMultipleCategories = Array.isArray(analysisData.categoriesDetailed) && analysisData.categoriesDetailed.length >= 2;
      
      console.log("[QuickAIResult-regenerate] === 카테고리 분석 시작 ===");
      console.log("[QuickAIResult-regenerate] analysisData.categoriesDetailed:", analysisData.categoriesDetailed);
      console.log("[QuickAIResult-regenerate] categoriesDetailed 개수:", analysisData.categoriesDetailed?.length || 0);
      console.log("[QuickAIResult-regenerate] hasMultipleCategories:", hasMultipleCategories);
      
      if (hasMultipleCategories) {
        // 카테고리가 2개 이상인 경우: 현재 선택된 카테고리의 키워드 사용
        const currentCategoryIndex = selectedCategoryIndex || 0;
        const selectedCategory = analysisData.categoriesDetailed[currentCategoryIndex];
        console.log("[QuickAIResult-regenerate] 현재 선택된 카테고리 인덱스:", currentCategoryIndex);
        console.log("[QuickAIResult-regenerate] 선택된 카테고리 데이터:", selectedCategory);
        console.log("[QuickAIResult-regenerate] 선택된 카테고리의 keywords:", selectedCategory?.keywords);
        console.log("[QuickAIResult-regenerate] keywords 타입:", typeof selectedCategory?.keywords);
        console.log("[QuickAIResult-regenerate] keywords 배열 여부:", Array.isArray(selectedCategory?.keywords));
        
        if (selectedCategory && Array.isArray(selectedCategory.keywords)) {
          keywordsArr = selectedCategory.keywords;
          console.log("[QuickAIResult-regenerate] ✅ 선택된 카테고리의 키워드 사용:", keywordsArr.length, "개");
          console.log("[QuickAIResult-regenerate] 사용된 키워드들:", keywordsArr);
        } else if (selectedCategory && selectedCategory.keywords && typeof selectedCategory.keywords === 'object') {
          // 키워드가 객체 형태인 경우 배열로 변환
          keywordsArr = Object.entries(selectedCategory.keywords).map(([key, value]) => ({ key, value }));
          console.log("[QuickAIResult-regenerate] ✅ 선택된 카테고리의 키워드 사용 (객체→배열):", keywordsArr.length, "개");
          console.log("[QuickAIResult-regenerate] 사용된 키워드들:", keywordsArr);
        } else {
          // fallback: 전체 키워드 사용
          keywordsArr = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
          console.log("[QuickAIResult-regenerate] ⚠️ fallback: 전체 키워드 사용 (선택된 카테고리에 키워드 없음)");
          console.log("[QuickAIResult-regenerate] 전체 키워드:", keywordsArr.length, "개");
        }
      } else {
        // 카테고리가 1개이거나 없는 경우: 전체 키워드 사용
        keywordsArr = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
        console.log("[QuickAIResult-regenerate] 카테고리가 1개이거나 없음 - 전체 키워드 사용:", keywordsArr.length, "개");
      }
      
      console.log("[QuickAIResult-regenerate] === 최종 사용된 키워드 배열 ===");
      console.log("[QuickAIResult-regenerate] keywordsArr 길이:", keywordsArr.length);
      console.log("[QuickAIResult-regenerate] keywordsArr 내용:", keywordsArr);
      console.log("[QuickAIResult-regenerate] === 카테고리 분석 끝 ===");
      
      const sortedKeywords = [...keywordsArr].sort((a, b) => (b.value || 0) - (a.value || 0));
      let topKeywordsWithTies = sortedKeywords.slice(0, 12);
      if (sortedKeywords.length > 12) {
        const thresholdValue = topKeywordsWithTies[topKeywordsWithTies.length - 1].value || 0;
        topKeywordsWithTies = sortedKeywords.filter((k) => (k.value || 0) >= thresholdValue);
      }
      const filteredKeywords = topKeywordsWithTies;
      keywordsRef.current = filteredKeywords.map((k) => k.key);

      // 2) 키워드수 계산 로직 재사용
      // === 키워드수 계산 ===
      let kcArr: { key: string; value: number }[] = [];

      // (1) 현재 선택된 카테고리의 keywordCounts 우선 사용
      if (Array.isArray(analysisData?.categoriesDetailed) && analysisData.categoriesDetailed.length >= 2) {
        const currentCategoryIndex = selectedCategoryIndex || 0;
        const selectedCategory = analysisData.categoriesDetailed[currentCategoryIndex];
        if (selectedCategory && selectedCategory.keywordCounts && typeof selectedCategory.keywordCounts === 'object') {
          kcArr = Object.entries(selectedCategory.keywordCounts as Record<string, number>).map(([k,v])=>({ key:k, value:Number(v) }));
        }
      }

      // (2) 전체 keywordCounts 사용 (fallback)
      if (kcArr.length === 0) {
        const kcSrc = analysisData.keywordCounts;
        if (Array.isArray(kcSrc) && kcSrc.length > 0) {
          kcArr = kcSrc as any;
        } else if (kcSrc && typeof kcSrc === 'object' && Object.keys(kcSrc).length > 0) {
          kcArr = Object.entries(kcSrc as Record<string, number>).map(([k,v])=>({ key:k, value:Number(v) }));
        } else if (Array.isArray(analysisData?.categoriesDetailed)) {
          // 카테고리별 keywordCounts 합산
          const agg: Record<string, number> = {};
          analysisData.categoriesDetailed.forEach((cat: any) => {
            const obj = cat.keywordCounts;
            if (obj && typeof obj === 'object') {
              for (const [k,v] of Object.entries(obj as Record<string, number>)) {
                agg[k] = (agg[k]||0) + Number(v);
              }
            }
          });
          kcArr = Object.entries(agg).map(([k,v])=>({ key:k, value:Number(v) }));
        }
      }

      let keywordCount = 10;
      if (kcArr.length > 0) {
        kcArr.sort((a, b) => {
          if (b.value !== a.value) return b.value - a.value; // 빈도수 내림차순
          return Number(b.key) - Number(a.key); // 동률이면 키워드 개수 내림차순
        });
        keywordCount = Number(kcArr[0].key);
      }
      keywordCountRef.current = keywordCount;
    }

    // 직전 호출 키워드 초기화하여 중복 방지 플래그 재설정
    lastCallKeyRef.current = null;

    // 재생성 로직 (keywordsRef, keywordCountRef는 이미 계산되어 있음)
    setLoading(true);
    setError(false);

    try {
      const keywordStr = keywordsRef.current.join(', ');

      console.log("[QuickAIResult-regenerate] === API 호출 정보 ===");
      console.log("[QuickAIResult-regenerate] 메인 키워드:", mainKeyword);
      console.log("[QuickAIResult-regenerate] 전송될 키워드 문자열:", keywordStr);
      console.log("[QuickAIResult-regenerate] keywordsRef.current:", keywordsRef.current);
      console.log("[QuickAIResult-regenerate] keywordCount:", keywordCountRef.current);
      console.log("[QuickAIResult-regenerate] === API 호출 시작 ===");

      console.log("[QuickAIResult] regenerate /api/generate-name", { query: mainKeyword, keyword: keywordStr, keywordCount: keywordCountRef.current });

      const resp = await fetch("/api/generate-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mainKeyword, keyword: keywordStr, keywordCount: keywordCountRef.current }),
      });

      if (!resp.ok) {
        throw new Error('failed');
      }

      const json = await resp.json();

      const tags = (() => {
        // 카테고리가 2개 이상이면 첫 번째 카테고리의 태그 사용, 그렇지 않으면 전체 태그 사용
        let tagsRaw: any[] = [];
        const hasMultipleCategories = Array.isArray(analysisData?.categoriesDetailed) && analysisData.categoriesDetailed.length >= 2;
        
        console.log("[QuickAIResult-regenerate-Tags] === 태그 분석 시작 ===");
        console.log("[QuickAIResult-regenerate-Tags] analysisData.categoriesDetailed:", analysisData?.categoriesDetailed);
        console.log("[QuickAIResult-regenerate-Tags] categoriesDetailed 개수:", analysisData?.categoriesDetailed?.length || 0);
        console.log("[QuickAIResult-regenerate-Tags] hasMultipleCategories:", hasMultipleCategories);
        
        if (hasMultipleCategories) {
          // 카테고리가 2개 이상인 경우: 현재 선택된 카테고리의 태그 사용
          const currentCategoryIndex = selectedCategoryIndex || 0;
          const selectedCategory = analysisData.categoriesDetailed[currentCategoryIndex];
          console.log("[QuickAIResult-regenerate-Tags] 현재 선택된 카테고리 인덱스:", currentCategoryIndex);
          console.log("[QuickAIResult-regenerate-Tags] 선택된 카테고리 데이터:", selectedCategory);
          console.log("[QuickAIResult-regenerate-Tags] 선택된 카테고리의 tags:", selectedCategory?.tags);
          console.log("[QuickAIResult-regenerate-Tags] tags 타입:", typeof selectedCategory?.tags);
          console.log("[QuickAIResult-regenerate-Tags] tags 배열 여부:", Array.isArray(selectedCategory?.tags));
          
          if (selectedCategory && Array.isArray(selectedCategory.tags)) {
            tagsRaw = selectedCategory.tags;
            console.log("[QuickAIResult-regenerate-Tags] ✅ 선택된 카테고리의 태그 사용 (배열):", tagsRaw.length, "개");
          } else if (selectedCategory && selectedCategory.tags && typeof selectedCategory.tags === 'object') {
            // 태그가 객체 형태인 경우 배열로 변환
            tagsRaw = Object.entries(selectedCategory.tags).map(([key, value]) => ({ key, value }));
            console.log("[QuickAIResult-regenerate-Tags] ✅ 선택된 카테고리의 태그 사용 (객체→배열):", tagsRaw.length, "개");
          } else {
            // fallback: 전체 태그 사용
            tagsRaw = Array.isArray(analysisData?.tags) ? analysisData.tags : [];
            console.log("[QuickAIResult-regenerate-Tags] ⚠️ fallback: 전체 태그 사용 (선택된 카테고리에 태그 없음)");
          }
        } else {
          // 카테고리가 1개이거나 없는 경우: 전체 태그 사용
          tagsRaw = Array.isArray(analysisData?.tags) ? analysisData.tags : [];
          console.log("[QuickAIResult-regenerate-Tags] 카테고리가 1개이거나 없음 - 전체 태그 사용:", tagsRaw.length, "개");
        }
        
        console.log("[QuickAIResult-regenerate-Tags] === 최종 사용된 태그 배열 ===");
        console.log("[QuickAIResult-regenerate-Tags] tagsRaw 길이:", tagsRaw.length);
        console.log("[QuickAIResult-regenerate-Tags] tagsRaw 내용:", tagsRaw);
        console.log("[QuickAIResult-regenerate-Tags] === 태그 분석 끝 ===");
        
        const topTags = tagsRaw
          .map((t: any) => ({ key: t.key ?? t.label ?? t.tag ?? "", value: Number(t.value ?? t.count ?? 0) }))
          .filter((t) => t.key)
          .sort((a, b) => b.value - a.value)
          .slice(0, 12)
          .map((t) => t.key);

        const nameLower = json.productName.toLowerCase();
        keywordsRef.current.slice(0, 12).forEach((kw) => {
          if (!nameLower.includes(kw.toLowerCase())) topTags.push(kw);
        });

        return Array.from(new Set(topTags));
      })();

      const cats = (() => {
        if (Array.isArray(analysisData?.categoriesDetailed) && analysisData.categoriesDetailed.length > 0) {
          const first = analysisData.categoriesDetailed[0];
          return [first.categoryName || first.categoryPath || first.name || ""];
        }
        if (Array.isArray(analysisData?.categories) && analysisData.categories.length > 0) {
          const first = analysisData.categories[0];
          return [first.key || first.categoryPath || first.name || ""];
        }
        return [];
      })();

      const newResult: AIResultData = {
        productName: json.productName,
        reason: json.reason,
        recommendedTags: tags,
        recommendedCategories: cats,
        keyword: mainKeyword,
        pageIndex,
      };

      setAiResult(newResult);

      // 사용량 1회 증가 – 이미 결과가 있을 때만
      if (hadPrevGenerated && currentUser?.email) {
        try {
          await UsageService.incrementProductOptimization(currentUser.email);
          console.log('[Usage] Product optimization usage incremented (Quick regenerate)');
        } catch (err) {
          console.error('[Usage] Failed to increment usage (Quick regenerate):', err);
        }
      }

      // GA 이벤트
      trackEvent('GenerateName', 'quick_regenerate_success', null, {
        keyword: mainKeyword,
        pageIndex,
        keywordCount: keywordCountRef.current,
      });

      // 히스토리 업데이트
      if (currentUser?.email) {
        try {
          await HistoryService.updateHistoryWithAIResult(
            currentUser.email,
            mainKeyword,
            'quick-optimizer',
            {
              productName: newResult.productName,
              reason: newResult.reason,
              recommendedTags: newResult.recommendedTags,
              recommendedCategories: newResult.recommendedCategories,
            },
            pageIndex
          );
          console.log('[QuickAIResult] History updated with regenerated AI result');
        } catch (err) {
          console.warn('[QuickAIResult] Failed to update history (regenerate):', err);
        }
      }
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (!aiResult) {
    if (isSample) {
      return (
        <Card className="mt-8 border-2 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Sparkles className="w-5 h-5" /> 예시 데이터 안내
            </CardTitle>
            <CardDescription>아래는 예시 데이터입니다. 실제 상품명 생성을 원하시면 키워드를 입력해 주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled className="px-8 py-4 bg-gradient-to-r from-indigo-400 to-blue-400 text-white font-semibold flex items-center gap-2 opacity-60 cursor-not-allowed">
              <Sparkles className="w-5 h-5" /> 상품명, 태그 생성하기 (예시에서는 비활성화)
            </Button>
          </CardContent>
        </Card>
      );
    }
    if (loading) {
      return (
        <Card className="mt-8 border-2 border-blue-200 animate-pulse">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Sparkles className="w-5 h-5" /> 상품명 생성 중...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-6 bg-blue-100 rounded w-3/4 mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded w-5/6" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          </CardContent>
        </Card>
      );
    }
    if (error) {
      return (
        <Card className="mt-8 border-2 border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Sparkles className="w-5 h-5" /> 상품명 생성 실패
            </CardTitle>
            <CardDescription>잠시 후 다시 시도해주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => {
              setError(false);
              setAiResult(null);
              hasCalledRef.current = false;
            }} className="bg-gradient-to-r from-sky-600 to-blue-600 text-white">
              상품명 다시 생성하기
            </Button>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="mt-8 border-2 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700">
          <Sparkles className="w-5 h-5" />
          {isMobile ? (
            <span>상위노출 상품명, 태그</span>
          ) : (
            <span>상위노출 상품명, 태그 제안</span>
          )}
        </CardTitle>
        <CardDescription>상위 노출 데이터와 SEO가이드를 기반으로 생성된 최적화 상품명입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* 사용량 제한 메시지는 상위 컴포넌트에서 표시 */}
        {/* 재생성 버튼 */}
        <div className="flex justify-center mb-6">
          <Button
            onClick={handleRegenerate}
            disabled={loading || isSample}
            className={`px-8 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold flex items-center gap-2${isSample ? ' opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" />
                <span>생성 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" /> 상품명, 태그 생성하기
              </>
            )}
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {/* 왼쪽 영역 */}
          <div className="space-y-6">
            {/* 상품명 */}
            <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2">
              <h4 className="font-semibold text-base flex items-center gap-1"><Sparkles className="w-5 h-5 text-blue-500"/> 생성된 상품명</h4>
              <div className="flex items-start gap-2">
                <p className="text-lg text-indigo-700 font-bold break-words whitespace-pre-wrap leading-relaxed flex-1">{aiResult.productName}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(aiResult.productName);
                    trackEvent('Copy', 'quick_product_name', null, {
                      query: mainKeyword,
                      pageIndex,
                      keywordCount: keywordCountRef.current,
                      generatedName: aiResult.productName,
                    });
                  }}
                  className="border-blue-600 text-blue-600 hover:bg-blue-50 shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 추천 태그 */}
            {aiResult.recommendedTags.length > 0 && (
              <div className="border rounded-lg p-4 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-base flex items-center gap-1"><Hash className="w-5 h-5 text-pink-500"/> 추천 태그</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(aiResult.recommendedTags.join(', '));
                      trackEvent('Copy', 'quick_tags', null, {
                        query: mainKeyword,
                        pageIndex,
                        keywordCount: keywordCountRef.current,
                        generatedName: aiResult.productName,
                      });
                    }}
                    className="border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiResult.recommendedTags.map((tag, idx) => (
                    <span key={idx} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 추천 카테고리 */}
            {aiResult.recommendedCategories.length > 0 && (
              <div className="border rounded-lg p-4 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-base flex items-center gap-1"><Layers className="w-5 h-5 text-green-500"/> 추천 카테고리</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(aiResult.recommendedCategories.join(', '));
                      trackEvent('Copy', 'quick_categories', null, {
                        query: mainKeyword,
                        pageIndex,
                        keywordCount: keywordCountRef.current,
                        generatedName: aiResult.productName,
                      });
                    }}
                    className="border-blue-600 text-blue-600 hover:bg-blue-50"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiResult.recommendedCategories.map((cat, idx) => (
                    <span key={idx} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium whitespace-nowrap">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 오른쪽 영역 */}
          <div className="space-y-6">
            {/* 생성 이유 */}
            <div className="border rounded-lg p-4 bg-white shadow-sm">
              <h4 className="font-semibold text-base mb-2 flex items-center gap-1"><ListOrdered className="w-5 h-5 text-purple-500"/> 생성 이유</h4>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{aiResult.reason}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 