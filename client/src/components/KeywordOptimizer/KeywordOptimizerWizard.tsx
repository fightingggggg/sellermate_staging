import React, { useState, useEffect } from "react";
import StepperHeader from "./StepperHeader";
import Step1Collect from "./steps/Step1Collect";
import Step2Refine from "./steps/Step2Refine";
import Step3Generate from "./steps/Step3Generate";
import { OptimizerProvider, useOptimizer } from "@/contexts/OptimizerContext";

// 로컬 스토리지에 저장된 분석 데이터를 읽어와 OptimizerContext에 주입
function PrefillProvider({ children }: { children: React.ReactNode }) {
  return (
    <OptimizerProvider>
      <PrefillInner>{children}</PrefillInner>
    </OptimizerProvider>
  );
}

function PrefillInner({ children }: { children: React.ReactNode }) {
  const { 
    setAnalysisData, 
    setMainKeyword, 
    setSynonymGroups, 
    setCombResult, 
    setSelectedMain,
    setGeneratedProductNames,
    setGeneratedReason,
    setGeneratedTags,
    setGeneratedCategories,
    setCombMainMap,
    resetAll
  } = useOptimizer();

  useEffect(() => {
    try {
      const allow = sessionStorage.getItem("allowPrefill") === "1";

      // 브라우저 새로고침(reload) 여부 판별 – reload 시 Prefill을 무시하여 초기 화면 유지
      let isReload = false;
      try {
        const navEntry = (performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined);
        if (navEntry && navEntry.type === 'reload') {
          isReload = true;
        } else if ((performance as any).navigation && (performance as any).navigation.type === 1) {
          // 구 API fallback (type 1 = reload)
          isReload = true;
        }
      } catch {}

      if (allow && !isReload) {
        const raw = localStorage.getItem("latestKeywordAnalysis");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.keyword && parsed?.data) {
            // 캐시 데이터 활용 로그
            console.log("[Prefill] localStorage.latestKeywordAnalysis에서 분석 데이터를 불러옵니다:", {
              keyword: parsed.keyword,
              pageIndex: parsed.pageIndex || parsed.data._pageIndex,
              source: "localStorage.latestKeywordAnalysis"
            });
            setMainKeyword(parsed.keyword);
            setAnalysisData(parsed.data);
            
            // 완벽한 상품명 생성 히스토리 데이터가 있으면 복원
            if (parsed.completeOptimizerData) {
              const { step2Data, step3Data } = parsed.completeOptimizerData;
              
              console.log('[Prefill] 완벽한 상품명 최적화 히스토리 데이터 복원:', parsed.completeOptimizerData);
              
              if (step2Data) {
                setSynonymGroups(step2Data.synonymGroups || []);
                setCombResult(step2Data.combResult || {});
                setSelectedMain(step2Data.selectedMain || parsed.keyword);
                if(step2Data.combMainMap){
                  setCombMainMap(step2Data.combMainMap);
                } else if(step2Data.combResult){
                  // combMainMap 없을 경우, combResult 키마다 selectedMain 매핑
                  const map: Record<string,string> = {};
                  Object.keys(step2Data.combResult).forEach(k=>{ map[k] = step2Data.selectedMain || parsed.keyword; });
                  setCombMainMap(map);
                }
                console.log('[Prefill] 2단계 데이터 복원:', step2Data);
              }
              
              if (step3Data) {
                setGeneratedProductNames(step3Data.productNames || []);
                setGeneratedReason(step3Data.reason || "");
                setGeneratedTags(step3Data.tags || []);
                setGeneratedCategories(step3Data.categories || []);
                console.log('[Prefill] 3단계 데이터 복원:', step3Data);
              }
            }

            // Prefill 완료 후 캐시 및 플래그를 즉시 제거 – 이후 새로고침 시 초기 화면 유지
            try {
              localStorage.removeItem("latestKeywordAnalysis");
              sessionStorage.removeItem("allowPrefill");
              console.log("[Prefill] Prefill 완료 – 캐시와 allowPrefill 플래그 제거");
            } catch {}
          }
        }
      }

      // reload 의 경우 또는 allowPrefill가 없는 경우, 플래그 제거
      if (isReload || !allow) {
        try {
          sessionStorage.removeItem("allowPrefill");
        } catch {}
      }
    } catch {}
  }, [setAnalysisData, setMainKeyword, setSynonymGroups, setCombResult, setSelectedMain, setGeneratedProductNames, setGeneratedReason, setGeneratedTags, setGeneratedCategories, setCombMainMap]);

  // optimizerReset 이벤트 발생 시 모든 상태 초기화
  useEffect(() => {
    const handler = () => {
      console.log('[PrefillInner] optimizerReset 이벤트 – 컨텍스트 상태 초기화');
      resetAll();
    };
    window.addEventListener('optimizerReset', handler);
    return () => window.removeEventListener('optimizerReset', handler);
  }, [resetAll]);

  return <>{children}</>;
}

// 다른 페이지에서도 사용할 수 있도록 export
export { PrefillProvider };

export default function KeywordOptimizerWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const goNext = () => setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
  const goPrev = () => setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev));

  // 히스토리에서 복원된 데이터를 기반으로 적절한 단계로 이동
  useEffect(() => {
    try {
      const allow = sessionStorage.getItem("allowPrefill") === "1";
      if (allow) {
        const raw = localStorage.getItem("latestKeywordAnalysis");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.completeOptimizerData?.currentStep) {
            const targetStep = parsed.completeOptimizerData.currentStep;
            console.log(`[Wizard] 히스토리에서 복원된 단계로 이동: ${targetStep}단계`);
            setStep(targetStep);
          }
        }
      }
    } catch {}
    
    // 실시간 히스토리 복원 이벤트 리스너
    const handleHistoryStepRestore = (event: CustomEvent) => {
      const { targetStep } = event.detail;
      console.log(`[Wizard] 실시간 단계 이동: ${targetStep}단계`);
      setStep(targetStep);
    };
    
    window.addEventListener('historyStepRestore', handleHistoryStepRestore as EventListener);
    
    return () => {
      window.removeEventListener('historyStepRestore', handleHistoryStepRestore as EventListener);
    };
  }, []);

  // 외부 optimizerReset 이벤트 발생 시 1단계로만 이동 (실제 상태 리셋은 PrefillInner에서 수행)
  useEffect(() => {
    const handler = () => {
      setStep(1);
    };
    window.addEventListener('optimizerReset', handler);
    return () => window.removeEventListener('optimizerReset', handler);
  }, []);

  return (
    <PrefillProvider>
      <div className="w-full max-w-screen-2xl mx-auto flex flex-col gap-6 px-2 sm:px-4 md:px-6 lg:px-8 py-0">
        <StepperHeader current={step} />
        {step === 1 && <Step1Collect onDone={goNext} />}
        {step === 2 && <Step2Refine onPrev={goPrev} onDone={goNext} />}
        {step === 3 && <Step3Generate onPrev={goPrev} onDone={() => setStep(2)} />}
      </div>
    </PrefillProvider>
  );
} 