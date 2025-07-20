import React, { createContext, useContext, useState } from "react";

interface OptimizerContextValue {
  analysisData: any | null;
  setAnalysisData: (data: any) => void;
  mainKeyword: string;
  setMainKeyword: (kw: string) => void;
  // 추가: 2단계 정제 결과 보관
  synonymGroups: Group[];
  setSynonymGroups: (groups: Group[]) => void;
  combResult: Record<string, '조합형' | '일체형'>;
  setCombResult: (res: Record<string, '조합형' | '일체형'>) => void;
  // 각 조합형/일체형 키워드별 검사 당시 메인 키워드 매핑
  combMainMap: Record<string,string>;
  setCombMainMap: (map: Record<string,string>) => void;
  // 2단계에서 선택한 메인 키워드 (조합형/일체형 검사용)
  selectedMain: string;
  setSelectedMain: (kw: string) => void;
  // 현재 선택된 카테고리 인덱스 (Step1 캐러셀과 연동)
  selectedCategoryIndex: number;
  setSelectedCategoryIndex: (idx: number) => void;
  // 전체 카테고리 데이터 (전체 카테고리가 선택되었을 때 사용)
  allCategoriesData: any | null;
  setAllCategoriesData: (data: any | null) => void;
  // AI 결과 상태 (빠른 상품명 최적화용)
  aiResult: AIResultData | null;
  setAiResult: (result: AIResultData | null) => void;
  // 3단계 생성 결과 상태
  generatedProductNames: string[];
  setGeneratedProductNames: (names: string[]) => void;
  generatedReason: string;
  setGeneratedReason: (reason: string) => void;
  generatedTags: string[];
  setGeneratedTags: (tags: string[]) => void;
  generatedCategories: string[];
  setGeneratedCategories: (categories: string[]) => void;
  resetAll: () => void;
}

// AI 결과 데이터 타입
export interface AIResultData {
  productName: string;
  reason: string;
  recommendedTags: string[];
  recommendedCategories: string[];
  keyword: string; // 어떤 키워드로 생성된 결과인지 추적
  pageIndex: number; // 어떤 페이지 번호로 생성된 결과인지 추적
}

// 타입: 2단계 그룹 형태. contexts 내부에서만 사용하므로 간단 선언
export interface Group {
  id: number;
  keywords: string[];
  merged?: boolean;
}

const OptimizerContext = createContext<OptimizerContextValue | undefined>(undefined);

export function OptimizerProvider({ children }: { children: React.ReactNode }) {
  const [analysisData, setAnalysisData] = useState<any | null>(null);
  const [mainKeyword, setMainKeyword] = useState("");
  const [synonymGroups, setSynonymGroups] = useState<Group[]>([]);
  const [combResult, setCombResult] = useState<Record<string, '조합형' | '일체형'>>({});
  const [combMainMap, setCombMainMap] = useState<Record<string,string>>({});
  const [selectedMain, setSelectedMain] = useState("");
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const [allCategoriesData, setAllCategoriesData] = useState<any | null>(null);
  const [aiResult, setAiResult] = useState<AIResultData | null>(null);
  const [generatedProductNames, setGeneratedProductNames] = useState<string[]>([]);
  const [generatedReason, setGeneratedReason] = useState<string>("");
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [generatedCategories, setGeneratedCategories] = useState<string[]>([]);

  // 컨텍스트 내부 상태를 초기 상태로 되돌리는 함수
  const resetAll = () => {
    setAnalysisData(null);
    setMainKeyword("");
    setSynonymGroups([]);
    setCombResult({});
    setCombMainMap({});
    setSelectedMain("");
    setSelectedCategoryIndex(0);
    setAllCategoriesData(null);
    setAiResult(null);
    setGeneratedProductNames([]);
    setGeneratedReason("");
    setGeneratedTags([]);
    setGeneratedCategories([]);
  };

  return (
    <OptimizerContext.Provider value={{ 
      analysisData, setAnalysisData, 
      mainKeyword, setMainKeyword, 
      synonymGroups, setSynonymGroups, 
      combResult, setCombResult, 
      combMainMap, setCombMainMap,
      selectedMain, setSelectedMain, 
      selectedCategoryIndex, setSelectedCategoryIndex, 
      allCategoriesData, setAllCategoriesData,
      aiResult, setAiResult,
      generatedProductNames, setGeneratedProductNames,
      generatedReason, setGeneratedReason,
      generatedTags, setGeneratedTags,
      generatedCategories, setGeneratedCategories,
      resetAll
    }}>
      {children}
    </OptimizerContext.Provider>
  );
}

export function useOptimizer() {
  const ctx = useContext(OptimizerContext);
  if (!ctx) throw new Error("useOptimizer must be used within OptimizerProvider");
  return ctx;
} 