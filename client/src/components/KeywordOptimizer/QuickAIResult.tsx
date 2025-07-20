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

interface QuickAIResultProps {
  onLimitMessage?: (msg: string | null) => void;
}

export default function QuickAIResult({ onLimitMessage }: QuickAIResultProps) {
  const { analysisData, mainKeyword, aiResult, setAiResult } = useOptimizer();
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

  // propagate message to parent
  useEffect(() => {
    if (onLimitMessage) onLimitMessage(usageLimitMessage);
  }, [usageLimitMessage, onLimitMessage]);

  useEffect(() => {
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

    const keywordsArr: any[] = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
    keywordsArrRef.current = keywordsArr;

    // 상위 12위와 동점인 키워드까지 모두 포함하도록 계산
    const sortedKeywords = [...keywordsArr].sort((a, b) => (b.value || 0) - (a.value || 0));
    let topKeywordsWithTies = sortedKeywords.slice(0, 12);

    if (sortedKeywords.length > 12) {
      const thresholdValue = topKeywordsWithTies[topKeywordsWithTies.length - 1].value || 0;
      topKeywordsWithTies = sortedKeywords.filter((k) => (k.value || 0) >= thresholdValue);
    }

    // 빈도 3 이상만 전달 (동점 12위까지 포함한 목록에서 다시 필터링)
    const filteredKeywords = topKeywordsWithTies.filter((k) => (k.value || 0) >= 3);
    keywordsRef.current = filteredKeywords.map((k) => k.key);

    // ===== 키워드 개수(상품명 어절 수) 우선순위 =====
    let keywordCount = 10; // 기본값

    // 1) keywordCounts 형태(Array | Obj) 우선
    const kcSrc = analysisData.keywordCounts;
    let kcArr: { key: string; value: number }[] = [];
    if (Array.isArray(kcSrc) && kcSrc.length > 0) {
      kcArr = kcSrc as any;
    } else if (kcSrc && typeof kcSrc === 'object' && Object.keys(kcSrc).length > 0) {
      kcArr = Object.entries(kcSrc as Record<string, number>).map(([k,v])=>({ key:k, value:Number(v) }));
    } else if (Array.isArray(analysisData.categoriesDetailed)) {
      // 2) 카테고리별 keywordCounts 합산 (fallback)
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
    }

    if (kcArr.length > 0) {
      let best = kcArr[0];
      kcArr.forEach((cur) => {
        if (cur.value > best.value) {
          best = cur;
        } else if (cur.value === best.value && Number(cur.key) > Number(best.key)) {
          best = cur;
        }
      });
      keywordCount = Number(best.key);
    }

    keywordCountRef.current = keywordCount;

    const calcRecommendedTags = (
      productName: string,
      analysis: any,
      displayKeywords: string[]
    ) => {
      const tagsRaw: any[] = Array.isArray(analysis.tags) ? analysis.tags : [];
      const topTags = tagsRaw
        .map((t: any) => ({ key: t.key ?? t.label ?? t.tag ?? "", value: Number(t.value ?? t.count ?? 0) }))
        .filter((t) => t.key)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);

      // 1) 상위 태그 12개 중 빈도 3회 이상만 추가
      const set = new Set<string>();
      topTags.filter((t) => t.value >= 3).forEach((t) => set.add(t.key));

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
    if (keywordsRef.current.length === 0 || keywordCountRef.current === 0) {
      if (!analysisData) {
        console.error('[QuickAIResult] analysisData missing – cannot regenerate');
        return;
      }

      // 1) 키워드 목록 계산
      const keywordsArr: any[] = Array.isArray(analysisData.keywords) ? analysisData.keywords : [];
      const sortedKeywords = [...keywordsArr].sort((a, b) => (b.value || 0) - (a.value || 0));
      let topKeywordsWithTies = sortedKeywords.slice(0, 12);
      if (sortedKeywords.length > 12) {
        const thresholdValue = topKeywordsWithTies[topKeywordsWithTies.length - 1].value || 0;
        topKeywordsWithTies = sortedKeywords.filter((k) => (k.value || 0) >= thresholdValue);
      }
      const filteredKeywords = topKeywordsWithTies.filter((k) => (k.value || 0) >= 3);
      keywordsRef.current = filteredKeywords.map((k) => k.key);

      // 2) 키워드수 계산 로직 재사용
      const kcSrc = analysisData.keywordCounts;
      let kcArr: { key: string; value: number }[] = [];
      if (Array.isArray(kcSrc) && kcSrc.length > 0) {
        kcArr = kcSrc as any;
      } else if (kcSrc && typeof kcSrc === 'object' && Object.keys(kcSrc).length > 0) {
        kcArr = Object.entries(kcSrc as Record<string, number>).map(([k,v])=>({ key:k, value:Number(v) }));
      } else if (Array.isArray(analysisData.categoriesDetailed)) {
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
      }

      let keywordCount = 10;
      if (kcArr.length > 0) {
        let best = kcArr[0];
        kcArr.forEach((cur) => {
          if (cur.value > best.value) best = cur;
          else if (cur.value === best.value && Number(cur.key) > Number(best.key)) best = cur;
        });
        keywordCount = Number(best.key);
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
        const tagsRaw: any[] = Array.isArray(analysisData?.tags) ? analysisData.tags : [];
        const topTags = tagsRaw
          .map((t: any) => ({ key: t.key ?? t.label ?? t.tag ?? "", value: Number(t.value ?? t.count ?? 0) }))
          .filter((t) => t.key)
          .sort((a, b) => b.value - a.value)
          .slice(0, 12)
          .filter((t) => t.value >= 3)
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
          <Sparkles className="w-5 h-5" /> 상위노출 상품명, 태그 제안
        </CardTitle>
        <CardDescription>상위 노출 데이터를 기반으로 생성된 최적화 상품명입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* 사용량 제한 메시지는 상위 컴포넌트에서 표시 */}
        {/* 재생성 버튼 */}
        <div className="flex justify-center mb-6">
          <Button
            onClick={handleRegenerate}
            disabled={loading}
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold flex items-center gap-2"
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