import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from "@/components/ui/card";
import { useOptimizer } from "@/contexts/OptimizerContext";
import { useAuth } from "@/contexts/AuthContext";
import { HistoryService } from "@/lib/historyService";
import { CheckCircle, XCircle, Info } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import type { Group } from "@/contexts/OptimizerContext";

interface Step2RefineProps {
  onPrev: () => void;
  onDone: () => void;
}

export default function Step2Refine({ onPrev, onDone }: Step2RefineProps) {
  const { analysisData, mainKeyword, setSynonymGroups, setCombResult, selectedCategoryIndex, selectedMain: ctxSelectedMain, setSelectedMain: setCtxSelectedMain, combMainMap, setCombMainMap, allCategoriesData } = useOptimizer();
  const { currentUser } = useAuth();
  const historyService = new HistoryService();

  // Step1과 동일한 정렬 로직 적용 (count 내림차순)
  const sortedCategoriesDetailed = React.useMemo(() => {
    if (!Array.isArray(analysisData?.categoriesDetailed)) return [];
    return [...analysisData.categoriesDetailed].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
  }, [analysisData?.categoriesDetailed]);

  // 선택된 카테고리 데이터 (전체 카테고리 또는 개별 카테고리)
  const categoryData: any | null = (() => {
    // 전체 카테고리가 선택된 경우 (selectedCategoryIndex === -1)
    if (selectedCategoryIndex === -1 && allCategoriesData) {
      console.log('[Step2] 전체 카테고리 데이터를 사용합니다.');
      return allCategoriesData;
    }
    
    // 개별 카테고리가 선택된 경우
    if (sortedCategoriesDetailed.length > 0) {
      return sortedCategoriesDetailed[selectedCategoryIndex] || null;
    }
    
    return null;
  })();

  // helpers: 객체 -> 배열 변환
  const objToArr = (obj: Record<string, number> | undefined) =>
    obj ? Object.entries(obj).map(([k, v]) => ({ key: k, value: v })) : [];

  // ===== 키워드, 제외 키워드 =====
  const keywordsArray: any[] = categoryData
    ? objToArr(categoryData.keywords)
    : analysisData?.keywords || [];

  const excludedKeywordsObj = categoryData
    ? {
        query: categoryData.excludedQuery || [],
        numbers: categoryData.excludedNumbers || [],
        brands: categoryData.excludedBrands || [],
      }
    : analysisData?.excludedKeywords || { query: [], numbers: [], brands: [] };

  // valueMap: 키워드 -> 노출수(count)
  const valueMap: Record<string, number> = React.useMemo(()=>{
    const m: Record<string, number> = {};
    keywordsArray.forEach((it:any)=>{
      m[it.key] = it.value || 0;
    });
    return m;
  }, [keywordsArray]);

  // 상위 12위 키워드 계산 (메인키워드 제외)
  const sortedKeywords = React.useMemo(()=>{
    return [...keywordsArray]
      .filter((it:any)=> it.key !== mainKeyword)
      .sort((a:any,b:any)=> (b.value||0) - (a.value||0));
  }, [keywordsArray, mainKeyword]);

  // 상위 12위 + 동점 키워드(빈도 3회 이상)만 포함 – Step1 기본 표시와 동일 기준
  const topKeywords: string[] = React.useMemo(() => {
    const filtered = sortedKeywords.filter((it: any) => (it.value || 0) >= 3);
    if (filtered.length <= 12) return filtered.map((it: any) => it.key);
    const threshold = filtered[11].value || 0;
    return filtered.filter((it: any) => (it.value || 0) >= threshold).map((it: any) => it.key);
  }, [sortedKeywords]);

  const thresholdCount = sortedKeywords.length >= 12 ? (sortedKeywords[11].value || 0) : 0;

  const sameKeywordsRaw: any[] = excludedKeywordsObj.query;

  // 메인 키워드와 동일(판매상품/입력 동일) 키워드 전체 수집
  const sameKeywords: string[] = React.useMemo(()=>{
    const set = new Set<string>();
    sameKeywordsRaw.forEach((item:any)=>{
      const kw = typeof item === 'string' ? item : item.key;
      if(kw && kw!==mainKeyword){
        set.add(kw);
      }
    });
    return Array.from(set);
  }, [sameKeywordsRaw, mainKeyword]);

  const { synonymGroups: ctxSynGroups, combResult: ctxCombResult } = useOptimizer();
  const [groups, setGroups] = useState<Group[]>(ctxSynGroups ?? []);
  const [nextId, setNextId] = useState(() => (ctxSynGroups && ctxSynGroups.length > 0) ? Math.max(...ctxSynGroups.map(g=>g.id))+1 : 1);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  // 맵: 키워드 -> 그룹ID (null = 미배정)
  const [kwMap, setKwMap] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {};
    // 메인 키워드 + 동일 키워드 + 상위 노출 키워드 모두 초기 맵에 포함
    [mainKeyword, ...sameKeywords, ...topKeywords].forEach((k) => {
      initial[k] = null;
    });
    (ctxSynGroups ?? []).forEach((g) => {
      g.keywords.forEach((k) => {
        initial[k] = g.id;
      });
    });
    return initial;
  });
  const [resultsVisible, setResultsVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [subStep, setSubStep] = useState<'syn' | 'comb'>('syn');
  const [combSelected, setCombSelected] = useState<Set<string>>(new Set());
  const [selectedMain, setSelectedMain] = useState<string>(ctxSelectedMain || mainKeyword);
  const [combChecking, setCombChecking] = useState(false);
  type CombKind = '조합형' | '조립형' | '일체형' | '독립형';
  const [combResult, setCombResultState] = useState<Record<string,CombKind>>(ctxCombResult as Record<string,CombKind> ?? {});
  // 처음 로드 시 comb 결과가 있으면 comb화면으로 이동시키기 위한 플래그
  const didInitSubStep = React.useRef(false);

  // ====== 메인 키워드 선택 후보 계산 (메인 + same + 동의어 검사 결과가 "같은 키워드"인 것만) ======
  const mainSelectKeywords = React.useMemo(() => {
    const base = new Set<string>([mainKeyword, ...sameKeywords]);

    // 동의어 검사 결과가 "같은 키워드"(merged: true)로 판정된 그룹에서만 키워드 추가
    groups.forEach((g) => {
      // 동의어 검사가 완료되고 "같은 키워드"로 판정된 경우에만
      if (g.merged === true) {
        // 메인 키워드 문자열에 포함되거나 동일 키워드 집합에 속한 키워드가 그룹에 있을 때
        const hasMainRelated = g.keywords.some((k) => {
          if (!k) return false;
          return mainKeyword.includes(k) || base.has(k);
        });

        if (hasMainRelated) {
          g.keywords.forEach((k) => {
            if (k && !base.has(k)) {
              base.add(k);
            }
          });
        }
      }
    });

    return Array.from(base);
  }, [mainKeyword, sameKeywords, groups]);

  // ====== 조합형 검사에서 제외할 키워드들 (메인 키워드와 동일한 키워드들만) ======
  const excludeFromCombCheck = React.useMemo(() => {
    return new Set([mainKeyword, ...sameKeywords]);
  }, [mainKeyword, sameKeywords]);

  // 결과 영역 표시 업데이트 (항상 동기화)
  useEffect(() => {
    const hasGroupResults = groups.some(g=>g.merged!==undefined);
    // 내부 플래그 제외하고 실제 결과가 있는지 확인
    const realCombKeys = Object.keys(combResult).filter(key => !key.startsWith('_'));
    const hasCombResults = realCombKeys.length > 0;
    if(hasGroupResults || hasCombResults){
      setResultsVisible(true);
    }
  }, [groups, combResult]);

  // 최초 로드 시 comb 결과가 있으면 comb 단계로 진입
  useEffect(() => {
    if(didInitSubStep.current) return;
    // 내부 플래그 제외하고 실제 결과가 있는지 확인
    const realKeywords = Object.keys(combResult).filter(key => !key.startsWith('_'));
    const hasCombResults = realKeywords.length > 0;
    if(hasCombResults){
      setSubStep('comb');
      setCombSelected(new Set(realKeywords));
    }
    didInitSubStep.current = true;
  }, [combResult]);

  // 메인 키워드(=새 query) 변경 시 로컬 상태 전체 초기화
  useEffect(() => {
    console.log('[Step2] 메인 키워드 변경 감지:', mainKeyword, 'Context 데이터:', { ctxSynGroups, ctxCombResult });
    
    // 1) 그룹/kwMap 재계산
    setGroups(ctxSynGroups ?? []);
    setKwMap(()=>{
      const init: Record<string, number|null> = {};
      [mainKeyword, ...sameKeywords, ...topKeywords].forEach(k=>{ init[k]=null; });
      (ctxSynGroups??[]).forEach(g=>g.keywords.forEach(k=>{ init[k]=g.id; }));
      return init;
    });

    // 2) selectedMain, comb, UI 상태 reset
    const contextSelectedMain = ctxSelectedMain || mainKeyword;
    setSelectedMain(contextSelectedMain);
    // 내부 플래그 제외하고 실제 결과가 있는지 확인
    const realCombKeys = Object.keys(ctxCombResult||{}).filter(key => !key.startsWith('_'));
    const hasComb = realCombKeys.length > 0;
    setCombSelected(hasComb ? new Set(realCombKeys) : new Set());
    setCombResultState(ctxCombResult as Record<string,CombKind> ?? {});
    setResultsVisible(groups.some(g=>g.merged!==undefined) || hasComb);
    setSubStep(hasComb ? 'comb' : 'syn');
    
    console.log('[Step2] 상태 초기화 완료:', { 
      groups: ctxSynGroups, 
      combResult: ctxCombResult, 
      selectedMain: contextSelectedMain,
      hasComb 
    });

    // combMainMap 재설정 로직
    {
      let updatedMap: Record<string,string>;
      if(Object.keys(combMainMap||{}).length>0){
        // ① 기존 맵이 있으면 유지하면서 누락된 키워드만 채움
        updatedMap = { ...combMainMap };
        Object.keys(ctxCombResult || {}).forEach(k=>{
          if(!k.startsWith('_') && !updatedMap[k]){
            updatedMap[k] = contextSelectedMain;
          }
        });
      } else {
        // ② 기존 맵이 없으면(새 쿼리) 새로 생성
        updatedMap = {};
        Object.keys(ctxCombResult || {}).forEach(k => {
          if (!k.startsWith('_')) {
            updatedMap[k] = contextSelectedMain;
          }
        });
      }
      setCombMainMap(updatedMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainKeyword]);

  // 선택된 main 변경 시(초기 마운트 제외) 결과를 유지하되 Context에만 저장
  const didMount = React.useRef(false);
  React.useEffect(() => {
    if (didMount.current) {
      // 결과( combResultState )는 그대로 두고, Context 의 selectedMain 만 업데이트
      setCtxSelectedMain(selectedMain);
    } else {
      didMount.current = true;
    }
  }, [selectedMain, setCtxSelectedMain]);

  // 전체 키워드 개수 체크
  const totalKeywordCount = React.useMemo(() => {
    return groups.reduce((sum, group) => sum + group.keywords.length, 0);
  }, [groups]);

  // 검사 대기 중인(merged 값이 아직 없는) 그룹과 키워드
  const pendingGroups = React.useMemo(() => groups.filter(g => g.merged === undefined), [groups]);
  const pendingKeywords = React.useMemo(() => pendingGroups.flatMap(g => g.keywords), [pendingGroups]);

  // 검사 완료된 그룹
  const doneGroups = React.useMemo(() => groups.filter(g => g.merged !== undefined), [groups]);
  // 동의어(true) 그룹을 먼저 보여주기 위해 정렬
  const doneGroupsSorted = React.useMemo(()=>{
    return [...doneGroups].sort((a,b)=>{
      if(a.merged===b.merged) return 0;
      return a.merged ? -1 : 1; // merged=true 우선
    });
  }, [doneGroups]);

  // 한 번에 선택 가능한 최대 키워드 수 (동의어 검사)
  const MAX_SELECT = 10;
  // 조합형/일체형 검사에서 한 번에 선택 가능한 최대 키워드 수
  const MAX_COMB_SELECT = 5;
  // 이전에 선택(제거 포함)된 키워드 기록 → 재선택 방지
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());

  const addKeywordToActiveGroup = (kw: string) => {
    if (kwMap[kw] !== null) {
      const gid = kwMap[kw]!;
      const grp = groups.find(g=>g.id===gid);
      if(grp && grp.merged !== undefined){
        // 이미 검사 완료된 키워드는 해제 불가
        return;
      }
      removeKeywordFromGroup(kw, gid);
      return;
    }

    if (pendingKeywords.length >= MAX_SELECT) {
      alert(`한 번에 최대 ${MAX_SELECT}개의 키워드까지만 선택할 수 있습니다.`);
      return;
    }

    // 이미 한 번 선택했다가 제거된 키워드는 다시 선택불가
    if(selectedHistory.has(kw)) return;

    // 키워드마다 독립적인 새 그룹 생성
    const newId = nextId;
    setGroups(prev => [...prev, { id: newId, keywords: [kw] }]);
    setKwMap(prev => ({ ...prev, [kw]: newId }));
    setNextId(prev => prev + 1);
  };

  const createGroup = () => {
    const newId = nextId;
    setGroups((prev) => [...prev, { id: newId, keywords: [] }]);
    setActiveGroupId(newId);
    setNextId(prev => prev + 1);
  };

  const addKeywordToGroup = (kw: string, groupId: number) => {
    if (kwMap[kw] !== null) return; // already assigned
    
    // 최대 10개 키워드 제한
    if (totalKeywordCount >= 10) {
      alert('최대 10개의 키워드까지만 선택할 수 있습니다.');
      return;
    }
    
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, keywords: [...g.keywords, kw] } : g))
    );
    setKwMap((prev) => ({ ...prev, [kw]: groupId }));
  };

  const removeKeywordFromGroup = (kw: string, groupId: number) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, keywords: g.keywords.filter((k) => k !== kw) } : g
      )
    );
    setKwMap((prev) => ({ ...prev, [kw]: null }));
  };

  const deleteGroup = (groupId: number) => {
    setGroups((prev) => {
      const target = prev.find((g) => g.id === groupId);
      if (target) {
        setKwMap((map) => {
          const newMap = { ...map };
          target.keywords.forEach((kw) => {
            newMap[kw] = null;
          });
          return newMap;
        });
      }
      return prev.filter((g) => g.id !== groupId);
    });
    
    // 삭제된 그룹이 활성 그룹이었다면 활성 그룹 초기화
    if (activeGroupId === groupId) {
      setActiveGroupId(null);
    }
  };

  const fetchTotal = async (kw: string): Promise<number> => {
    const res = await fetch(`/api/naver-total?q=${encodeURIComponent(kw)}`);
    const raw = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch (parseErr) {
      console.error('응답 JSON 파싱 실패', { kw, raw });
      throw new Error('invalid json');
    }
    if (!res.ok) {
      console.error('네이버 API 호출 실패', json);
      throw new Error('naver api error');
    }
    return json.total as number;
  };

  // ===== [NEW] total 값 규모에 따른 허용 오차 계산 =====
  const getDynamicThreshold = (total: number): number => {
    if (total >= 10_000_000) return 10000; // 9자리 이상
    if (total >= 1_000_000) return 5000;  // 8자리 이상
    if (total >= 1_000_00) return 1000;  // 7자리 이상
    if (total >= 100_000) return 100;     // 6자리 이상
    if (total >= 10_000) return 20;      // 5자리 이상
    return 10;                           // 그 외 (4자리 이하)
  };

  const runSynonymCheck = async () => {
    setChecking(true);
    try {
      // 1) 검사 대기 중인 키워드만 수집
      const selected: string[] = [...pendingKeywords];

      if (selected.length === 0) {
        alert('먼저 키워드를 선택해주세요.');
        setChecking(false);
        return;
      }

      // 2) 네이버 total 값 조회
      const totalsArr = await Promise.all(selected.map((kw) => fetchTotal(kw)));
      const totalMap: Record<string, number> = {};
      selected.forEach((kw, idx) => {
        totalMap[kw] = totalsArr[idx];
      });

      // 3) total 수가 유사한 키워드끼리 자동 그룹핑
      type TempGroup = { id: number; repTotal: number; keywords: string[] };
      const tempGroups: TempGroup[] = [];
      let gid = nextId;

      selected.forEach((kw) => {
        const t = totalMap[kw] || 0;
        let match = tempGroups.find((g) => {
          const diff = Math.abs(t - g.repTotal);
          const threshold = getDynamicThreshold(Math.max(t, g.repTotal));
          return diff <= threshold;
        });
        if (!match) {
          match = { id: gid++, repTotal: t, keywords: [] };
          tempGroups.push(match);
        }
        match.keywords.push(kw);
      });

      const newGroups: Group[] = tempGroups.map((g) => {
        // 메인 키워드 및 동일 키워드가 포함된 키워드를 대표 키워드로 설정
        const mainKeywords = [mainKeyword, ...sameKeywords];
        let representativeKeyword = g.keywords[0]; // 기본값
        
        // 메인 키워드 또는 동일 키워드가 포함된 키워드를 찾아서 대표 키워드로 설정
        for (const keyword of g.keywords) {
          // 정확히 일치하는 경우
          if (mainKeywords.includes(keyword)) {
            representativeKeyword = keyword;
            break;
          }
          // 메인 키워드가 포함된 키워드인 경우 (예: "왕새우"에 "새우"가 포함됨)
          if (mainKeywords.some(mainKw => keyword.includes(mainKw))) {
            representativeKeyword = keyword;
            break;
          }
        }
        
        // 대표 키워드를 첫 번째 위치로 이동
        const reorderedKeywords = [representativeKeyword, ...g.keywords.filter(k => k !== representativeKeyword)];
        
        return {
          id: g.id,
          keywords: reorderedKeywords,
          merged: g.keywords.length > 1,
        };
      });

      const mergedGroupsAll = [...groups.filter(g => g.merged !== undefined), ...newGroups];
      setGroups(mergedGroupsAll);
      setSynonymGroups(mergedGroupsAll); // Context 업데이트
      setResultsVisible(true);
      // 검사 완료된 키워드는 재선택 금지 기록
      setSelectedHistory(prev => {
        const s = new Set(prev);
        mergedGroupsAll.forEach(g=>g.keywords.forEach(k=>s.add(k)));
        return s;
      });
      setNextId(gid);
      
      // GA – 동의어 검사 결과 이벤트
      trackEvent('CheckResult', 'synonym', null, {
        groupCount: mergedGroupsAll.length,
        keywordCount: selected.length,
        keywords: selected.join(', '),
        mainKeyword: mainKeyword,
        results: mergedGroupsAll.map(g => `${g.keywords.join(', ')}-${g.merged}`).join(';')
      });

      // 히스토리 업데이트 (2단계 데이터 저장)
      if (currentUser?.email && mainKeyword) {
        const pageIndex = (analysisData as any)?._pageIndex;
        // combResult에서 '조립형', '독립형' 제외하고 '조합형', '일체형'만 저장
        const filteredCombResult: Record<string, '조합형' | '일체형'> = {};
        Object.entries(combResult).forEach(([key, value]) => {
          if (value === '조합형' || value === '일체형') {
            filteredCombResult[key] = value;
          }
        });
        
        const step2Data = {
          synonymGroups: mergedGroupsAll,
          combResult: filteredCombResult,
          selectedMain: selectedMain,
          combMainMap: combMainMap
        };
        
        try {
          await HistoryService.updateHistoryWithStep2Data(
            currentUser.email,
            mainKeyword,
            step2Data,
            pageIndex
          );
          console.log('[Step2] History updated with synonym check results');
        } catch (error) {
          console.error('[Step2] Failed to update history with synonym results:', error);
        }
      }
    } catch (e) {
      console.error('동의어 검사 오류', e);
      alert('동의어 검사 중 오류가 발생했습니다');
    } finally {
      setChecking(false);
    }
  };

  // 조립형/독립형 검사 대상 키워드 계산
  const combKeywords = React.useMemo(() => {
    const labels: string[] = [];
    const covered = new Set<string>();

    // 1) 그룹 결과를 우선 반영
    groups.forEach((g) => {
      if (g.keywords.length === 0) return; // 빈 그룹 스킵

      if (g.merged) {
        const rep = g.keywords[0];
        if (!rep) return; // 안전장치
        const others = g.keywords.slice(1).filter(Boolean);
        const label = others.length ? `${rep}(=${others.join(', ')})` : rep;
        labels.push(label);
        g.keywords.forEach((k) => k && covered.add(k));
      } else {
        g.keywords.forEach((k) => {
          if (!k) return;
          labels.push(k);
          covered.add(k);
        });
      }
    });

    // 2) 그룹에 포함되지 않은 same / top 키워드 추가 (sameKeywords 우선)
    [...sameKeywords, ...topKeywords].forEach((k) => {
      if(k===mainKeyword) return; // 메인 키워드는 별도 표시
      if (!covered.has(k)) labels.push(k);
    });

    // 기본 12개 이상이어도 상위 키워드(동점 포함) 만큼은 모두 포함
    const minNeeded = labels.findIndex((lab)=>topKeywords.includes(stripParen(lab))) !== -1 ? 12 : labels.length;
    const ensureCount = Math.max(12, topKeywords.length + sameKeywords.length + 1); // +1 = 메인

    // --- NEW: Ensure we have at least 12 keywords (메인 제외) including ties ---
    // 이미 포함된 키워드들을 Set으로 관리
    const includedKeywords = new Set(labels.map(l=>stripParen(l)));
    
    // 동의어 그룹에 포함된 모든 키워드들 수집
    const groupedKeywords = new Set<string>();
    groups.forEach(group => {
      if (group.keywords && group.keywords.length > 0) {
        group.keywords.forEach(kw => {
          if (kw) groupedKeywords.add(kw);
        });
      }
    });
    
    // 메인 키워드와 동일한 키워드들을 제외하고 실제 검사 대상 키워드 개수 계산
    // 단, 동의어 그룹의 대표 키워드는 조합형 검사 대상에 포함
    const actualKeywordCount = Array.from(includedKeywords).filter(kw => !excludeFromCombCheck.has(kw)).length;
    
    console.log('[Step2] combKeywords 계산 시작:', {
      labels: labels,
      includedCount: includedKeywords.size,
      actualKeywordCount: actualKeywordCount,
      mainKeyword: mainKeyword,
      sameKeywords: sameKeywords,
      mainSelectKeywords: mainSelectKeywords,
      excludeSet: Array.from(excludeFromCombCheck),
      groupedKeywords: Array.from(groupedKeywords),
      sortedKeywordsLength: sortedKeywords.length
    });

    if (actualKeywordCount < 12) {
      console.log('[Step2] 12개 미만이므로 추가 시작. 현재 개수:', actualKeywordCount);
      let thresholdVal: number | null = null;
      let currentActualCount = actualKeywordCount;
      
      // sortedKeywords에서 순서대로 추가
      for (const kwObj of sortedKeywords) {
        const kw = kwObj.key;
        const val = kwObj.value || 0;
        
        // 빈도가 3 미만인 키워드를 만나면 더 이상 추가할 키워드가 없으므로 종료
        if (val < 3) {
          console.log('[Step2] 빈도 3 미만으로 키워드 추가 종료:', kw, '(빈도:', val + ')');
          break;
        }
        
        // 이미 포함된 키워드 또는 동의어 그룹에 포함된 키워드는 건너뛰기
        if (includedKeywords.has(kw) || groupedKeywords.has(kw)) {
          console.log('[Step2] 건너뛰기:', kw, '(이미 포함됨 또는 동의어 그룹에 포함됨)');
          continue;
        }
        
        // 메인/동일 키워드가 아닌 경우에만 실제 카운트 증가
        const willIncrementCount = !excludeFromCombCheck.has(kw);
        const nextCount = willIncrementCount ? currentActualCount + 1 : currentActualCount;
        
        // 12개 초과 시 동점 체크를 먼저 수행
        if (nextCount > 12) {
          if (thresholdVal === null || val !== thresholdVal) {
            console.log('[Step2] tie 구간 끝. 종료. 현재 개수:', currentActualCount, '(thresholdVal:', thresholdVal, ', 현재 val:', val + ')');
            break; // tie 구간 끝나면 종료
          }
        }
        
        console.log('[Step2] 추가됨:', kw, '(빈도:', val + ')');
        labels.push(kw);
        includedKeywords.add(kw);
        
        if (willIncrementCount) {
          currentActualCount = nextCount;
          console.log('[Step2] 카운트 증가:', kw, '→', currentActualCount);
        }
        
        if (currentActualCount === 12) {
          thresholdVal = val; // 12번째 키워드의 value
          console.log('[Step2] 12개 달성. thresholdVal:', thresholdVal);
          continue; // 동점 확인을 위해 계속
        }
      }
      console.log('[Step2] 추가 완료. 최종 개수:', currentActualCount);
    }

    // 최종 길이 계산 (동점 포함, 이미 labels 에 추가된 상태)
    const finalLen = Math.max(minNeeded, ensureCount, labels.length);
    console.log('[Step2] 최종 길이 계산:', { minNeeded, ensureCount, labelsLength: labels.length, finalLen });
    return labels.slice(0, finalLen);
  }, [groups, topKeywords, sameKeywords, mainKeyword, sortedKeywords, mainSelectKeywords]);

  // helper: 괄호 내 표현 제거 → '키워드(기타)' ⇒ '키워드'
  function stripParen(kw: string) {
    return kw.includes('(') ? kw.split('(')[0].trim() : kw;
  }

  const buildCombination = (raw: string, main: string) => {
    const kw = stripParen(raw);
    let spaced = '';
    if (kw.includes(main)) {
      spaced = kw.replace(main, ` ${main} `).replace(/\s+/g, ' ').trim();
    } else {
      spaced = `${kw} ${main}`;
    }
    const concat = kw.includes(main) ? kw : `${kw}${main}`;
    return { spaced, concat };
  };

  const runCombinationCheck = async () => {
    setCombChecking(true);
    try{
      const results: Record<string,CombKind> = {...combResult}; // 기존 결과 복사
      const keywordsToCheck = Array.from(combSelected).filter(kw => !combResult[kw]); // 아직 검사하지 않은 키워드만
      
      const mainUsedMap: Record<string,string> = {};
      for(const kw of keywordsToCheck){
        const { spaced, concat } = buildCombination(kw, selectedMain);
        const [t1,t2] = await Promise.all([fetchTotal(spaced), fetchTotal(concat)]);
        // 허용 오차 적용 → comb kind
        const diff = Math.abs(t1 - t2);
        const threshold = getDynamicThreshold(Math.max(t1, t2));
        
        // 수정된 로직: total 수가 다르면 일체형, 같으면 조합형
        if (diff <= threshold) {
          results[kw] = '조합형';
        } else {
          results[kw] = '일체형';
        }
        

        // 메인 사용 기록
        mainUsedMap[kw] = selectedMain;
      }
      setCombMainMap({ ...combMainMap, ...mainUsedMap });
      setCombResultState(results);
      
      // combResult에서 '조립형', '독립형' 제외하고 '조합형', '일체형'만 Context에 저장
      const filteredCombResult: Record<string, '조합형' | '일체형'> = {};
      Object.entries(results).forEach(([key, value]) => {
        if (value === '조합형' || value === '일체형') {
          filteredCombResult[key] = value;
        }
      });
      setCombResult(filteredCombResult); // Context 업데이트

      // GA – 조합형/일체형 검사 결과 이벤트
      trackEvent('CheckResult', 'combination', null, {
        keywordCount: Object.keys(filteredCombResult).length,
        keywords: Object.keys(filteredCombResult).join(', '),
        mainKeyword: selectedMain,
        results: Object.entries(filteredCombResult).map(([keyword, type]) => `${keyword}-${type}`).join(',')
      });
      
      // 히스토리 업데이트 (2단계 데이터 저장)
      if (currentUser?.email && mainKeyword) {
        const pageIndex = (analysisData as any)?._pageIndex;
        const step2Data = {
          synonymGroups: groups,
          combResult: filteredCombResult,
          selectedMain: selectedMain,
          combMainMap: combMainMap
        };
        
        try {
          await HistoryService.updateHistoryWithStep2Data(
            currentUser.email,
            mainKeyword,
            step2Data,
            pageIndex
          );
          console.log('[Step2] History updated with combination check results');
        } catch (error) {
          console.error('[Step2] Failed to update history with combination results:', error);
        }
      }
    }catch(e){
      console.error('조합형 검사 오류',e);
      alert('조합형 검사 중 오류 발생');
    }finally{setCombChecking(false);}
  };

  // 현재 새로 선택된(검사 전) 조합형 키워드 수 계산
  const newCombSelectedCount = React.useMemo(() => {
    return Array.from(combSelected).filter(k => !combResult[k]).length;
  }, [combSelected, combResult]);

  // 메인 키워드 변경 확인 팝업 제어
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingMain, setPendingMain] = useState<string | null>(null);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-8">
      {/* <h2 className="text-2xl font-bold text-center">2단계 –  검색 로직 기반으로 키워드 똑똑하게 정리</h2> */}

      {/* 안내 Alert (동의어 검사) */}
      {subStep === 'syn' && (
        <Alert className="bg-primary/10 border-primary/30">
          <Info className="w-4 h-4" />
          <AlertTitle>동의어 검사란?</AlertTitle>
          <AlertDescription>
            동의어 검사는 서로 다른 단어처럼 보여도, 실제로 같은 의미로 검색되는 단어인지 확인하는 과정이에요.<br />
            예: <strong>'바지'</strong>와 <strong>'팬츠'</strong>는 글씨는 다르지만, 같은 검색어로 인지되는 동의어예요.
          </AlertDescription>
        </Alert>
      )}

      {/* ① 키워드 선택 영역 */}
      <Card>
        <CardHeader>
          <CardTitle>동의어 검사</CardTitle>
          <p className="text-sm text-gray-500">글자는 달라도 비슷한 뜻을 가진 단어들을 선택해주세요.<br/>
        예: 화장지, 휴지/ 주스용, 쥬스용/ 국내산, 국산</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 메인 + 동일 키워드 */}
            <div>
              <h4 className="text-sm font-medium mb-1">메인 키워드 및 동일 키워드</h4>
              <div className="flex flex-wrap gap-2">
                {mainSelectKeywords.map((kw)=>{
                  if(!kw) return null;
                  const gid = kwMap[kw];
                  const group = gid != null ? groups.find(g=>g.id===gid) : undefined;
                  const isDone = group && group.merged !== undefined;
                  const isAssigned = gid != null;
                  const disabled = (isDone) || (selectedHistory.has(kw) && !isAssigned) || (pendingKeywords.length >= MAX_SELECT && !isAssigned);
                  return (
                    <button
                      key={`kw-main-same-${kw}`}
                      onClick={()=>addKeywordToActiveGroup(kw)}
                      disabled={disabled}
                      className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                        isAssigned 
                          ? "bg-blue-200 text-blue-700 hover:bg-blue-300" 
                          : disabled 
                            ? "bg-gray-300 text-gray-400 cursor-not-allowed"
                            : "bg-gray-100 text-gray-700 hover:bg-blue-100"
                      }`}
                    >
                      {kw}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* top keywords */}
            <div>
              <h4 className="text-sm font-medium mb-1">실제 상위 노출 키워드</h4>
              <div className="flex flex-wrap gap-2">
                {topKeywords.map((kw) => {
                  const gid = kwMap[kw];
                  const group = gid != null ? groups.find(g=>g.id===gid) : undefined;
                  const isDone = group && group.merged !== undefined;
                  const isAssigned = gid != null;
                  const disabled = (isDone) || (selectedHistory.has(kw) && !isAssigned) || (pendingKeywords.length >= MAX_SELECT && !isAssigned);
                  return (
                    <button
                      key={`top-${kw}`}
                      onClick={() => addKeywordToActiveGroup(kw)}
                      disabled={disabled}
                      className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                        isAssigned 
                          ? "bg-blue-200 text-blue-700 hover:bg-blue-300" 
                          : disabled 
                            ? "bg-gray-300 text-gray-400 cursor-not-allowed"
                            : "bg-gray-100 text-gray-700 hover:bg-blue-100"
                      }`}
                    >
                      {kw}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
        {subStep==='syn' && pendingKeywords.length >= MAX_SELECT && (
          <CardFooter>
            <Alert className="bg-red-50 border-red-300 w-full">
              <Info className="w-4 h-4 text-red-600" />
              <AlertDescription>
                키워드는 한 번에 10개까지 검사할 수 있어요. 새로운 키워드는 검사 후 이어서 확인해보세요!
              </AlertDescription>
            </Alert>
          </CardFooter>
        )}
      </Card>

      {/* Actions & Navigation (유사어 단계에서만) */}
      {subStep === 'syn' && (
  <div className="flex justify-between items-center w-full">
    {/* 왼쪽 끝 - 이전 단계 */}
    <Button variant="outline" onClick={onPrev}>이전 단계</Button>

    {/* 오른쪽 끝 - 동의어 검사 생략 + 진행 */}
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => {
        trackEvent('SkipCheck','syn_skip');
        setSubStep('comb');
      }}>
        검사 생략
      </Button>
      <Button onClick={runSynonymCheck} disabled={pendingKeywords.length === 0 || checking}>
        {checking ? '검사 중...' : '동의어 검사 진행'}
      </Button>
    </div>
  </div>
)}


      {/* 선택된 키워드 (검사 대기) */}
      {subStep==='syn' && pendingKeywords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>선택된 키워드</CardTitle>
            <p className="text-sm text-gray-500">검사 버튼을 눌러 동의어 여부를 확인하세요.</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingKeywords.map((kw)=> (
                <span key={`pending-${kw}`} className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-200 text-sm">
                  {kw}
                  <button
                    onClick={()=>{
                      const gid = kwMap[kw];
                      if(gid!=null){
                        removeKeywordFromGroup(kw, gid);
                      }
                    }}
                    className="text-gray-500 hover:text-gray-600"
                  >×</button>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ④ 검사 결과 시각화 */}
      {resultsVisible && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>동의어 검사 결과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {doneGroupsSorted.map((g, idx) => {
              const originalIdx = groups.findIndex(originalGroup => originalGroup.id === g.id);
              return (
                <div key={`res-${g.id}`} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {g.merged ? (
                      <CheckCircle className="text-green-500 w-5 h-5" />
                    ) : (
                      <XCircle className="text-red-500 w-5 h-5" />
                    )}
                    <span className="font-semibold">
                      {g.merged
                        ? <>
                            <span className="text-blue-600">"{g.keywords.join(', ')}"</span>는/은 같은 키워드입니다
                          </>
                        : <>
                            <span className="text-blue-600">"{g.keywords.join(', ')}"</span>는/은 다른 키워드입니다
                          </>}
                    </span>
                  </div>
                  {g.merged ? (
                    <>
                      <p className="text-sm">
                        대표 키워드: <span className="font-semibold text-blue-600">{g.keywords[0]}</span>
                      </p>
                      <p className="text-sm">
                        포함된 키워드: {g.keywords.slice(1).join(", ") || "(없음)"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm">포함 키워드: {g.keywords.join(", ")}</p>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={()=>setSubStep('comb')}>조합형/일체형 검사로</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================= Combination Step UI ================= */}
      {subStep==='comb' && (
        <>
          <Alert className="bg-orange-50 border-orange-300">
            <Info className="w-4 h-4 text-orange-600" />
            <AlertTitle>조합형 / 일체형 검사란?</AlertTitle>
            <AlertDescription>
              메인 키워드를 생략해도 되는지, 꼭 써야 하는지를 확인하는 과정이에요.<br />
              예:  메인 키워드가 고구마 일 때, '밤고구마'와 '꿀고구마'가 <strong>조합형</strong>이면 → <strong>'밤 꿀 고구마'</strong>처럼 고구마를 한 번만 써도 둘 다 검색되고,<br />
              <strong>일체형</strong>이면 → <strong>'밤고구마 꿀고구마'</strong>처럼 붙여서 고구마 두 개를 써야 둘 다 검색돼요.
            </AlertDescription>
          </Alert>
        </>
      )}
      {subStep==='comb' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">조합형 / 일체형 키워드 검사</CardTitle>
            <p className="text-sm text-gray-500">메인 키워드와 함께 붙여 쓸 수 있는 단어들을 골라주세요.
            예: 메인 키워드가 토마토일 때 → '찰'토마토, '방울'토마토</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* main keyword (선택 가능) */}
            <div>
              <span className="text-xs text-gray-500 mr-2">메인 키워드 선택</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {mainSelectKeywords.map((kw) => {
                  const isSelected = selectedMain === kw;
                  return (
                    <button
                      key={`main-select-${kw}`}
                      onClick={() => {
                        if (kw === selectedMain) return; // 이미 선택된 메인일 때 무시

                        if (newCombSelectedCount > 0) {
                          // 검사하지 않은 키워드가 있을 때만 확인 팝업 오픈
                          setPendingMain(kw);
                          setConfirmOpen(true);
                          return;
                        }

                        // 검사하지 않은 키워드가 없으면 바로 변경
                        setSelectedMain(kw);
                      }}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${isSelected ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {kw}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* chip grid */}
            <div className="grid grid-cols-3 gap-3">
              {combKeywords.map((kw) => {
                const baseColor = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
                const selectedColor = 'bg-blue-200 text-blue-700 hover:bg-blue-300';
                // 이미 검사 완료된 키워드 제외하고 새로 선택할 수 있는 키워드 개수 계산
                const newSelectedCount = newCombSelectedCount;
                const disabledCond = !combSelected.has(kw) && !combResult[kw] && newSelectedCount >= MAX_COMB_SELECT;
                return (
                  <button
                    key={`comb-${kw}`}
                    onClick={() => {
                      setCombSelected((prev) => {
                        const s = new Set(prev);
                        if (s.has(kw)) {
                          s.delete(kw);
                        } else {
                          // 이미 검사 완료된 키워드이거나, 새로 선택할 수 있는 경우
                          const newSelectedCount = Array.from(s).filter(k => !combResult[k]).length;
                          if (combResult[kw] || newSelectedCount < MAX_COMB_SELECT) {
                            s.add(kw);
                          }
                        }
                        return s;
                      });
                    }}
                    disabled={disabledCond}
                    className={`px-3 py-2 rounded-full text-sm truncate transition-colors ${combSelected.has(kw) ? selectedColor : baseColor} ${disabledCond ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {kw}
                  </button>
                );
              })}
            </div>

            {/* 5개 선택 제한 안내 메시지 */}
            {newCombSelectedCount >= MAX_COMB_SELECT && (
              <Alert className="bg-red-50 border-red-300 mt-4">
                <Info className="w-4 h-4 text-red-600" />
                <AlertDescription>
                  키워드는 한 번에 5개까지 검사할 수 있어요. 새로운 키워드는 검사 후 이어서 해보세요!
                </AlertDescription>
              </Alert>
            )}

            {/* selected preview */}
            {/* [변경] 미리보기: 메인 키워드별로 그룹핑하여 검사된 키워드도 모두 보여줌 */}
            {(combSelected.size > 0 || Object.keys(combResult).filter(k => !k.startsWith('_')).length > 0) && (
              <div className="mt-6 space-y-4">
                <h4 className="text-sm font-medium">미리보기</h4>
                {(() => {
                  // 1. 검사된 키워드(조합형/일체형 결과가 있는 키워드)
                  const checkedKeywords = Object.keys(combResult).filter(k => !k.startsWith('_'));
                  // 2. 선택된 키워드(아직 검사 전)
                  const selectedKeywords = Array.from(combSelected).filter(k => !combResult[k]);
                  // 3. 전체 미리보기 키워드(중복 없이)
                  const allPreviewKeywords = Array.from(new Set([...checkedKeywords, ...selectedKeywords]));
                  // 4. 메인 키워드별로 그룹핑
                  const groupMap: Record<string, string[]> = {};
                  allPreviewKeywords.forEach((kw) => {
                    const main = combMainMap[kw] || selectedMain;
                    if (!groupMap[main]) groupMap[main] = [];
                    groupMap[main].push(kw);
                  });
                  // 5. 메인 키워드별로 미리보기 렌더링
                  return Object.entries(groupMap).map(([mainKw, kwList]) => (
                    <div key={`preview-${mainKw}`} className="space-y-2">
                      <div className="text-xs font-semibold text-gray-600">메인 키워드: {mainKw}</div>
                      <div className="flex gap-3 py-1 items-start">
                        {/* label column */}
                        <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-white text-xs font-semibold sticky left-0">
                          <span className="text-green-600">조합형</span>
                          <span className="text-orange-600">일체형</span>
                        </div>
                        {/* keywords in 5-column grid */}
                        <div className="flex-1">
                          <div className="grid grid-cols-5 gap-3">
                            {kwList.map((k) => {
                              const comb = buildCombination(k, mainKw);
                              const kind = combResult[k];
                              const isMerge = kind === '조합형' || kind === '조립형';
                              const isIndep = kind === '일체형' || kind === '독립형';
                              return (
                                <div key={`combo-${mainKw}-${k}`} className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-gray-50 border whitespace-nowrap text-sm items-center">
                                  <span className={isMerge ? 'text-green-600 font-semibold' : ''}>{comb.spaced}</span>
                                  <span className={isIndep ? 'text-orange-600 font-semibold' : ''}>{comb.concat}</span>
                                  {kind && (
                                    <span className={`text-xs mt-1 font-semibold ${isMerge ? 'text-green-600' : 'text-orange-600'}`}>{kind === '독립형' ? '일체형' : kind}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* 검사/생략 버튼 */}
            <div className="flex justify-end mt-4 gap-3">
              <Button variant="secondary" onClick={()=>{
                trackEvent('SkipCheck','comb_skip');
                // 검사 생략 시에도 3단계로 가기 위해 최소한의 결과 설정
                setSynonymGroups(groups);
                // 빈 객체 대신 생략 플래그를 넣어 hasExistingResults가 true가 되도록 함
                setCombResult({ _step2Completed: true } as any);
                onDone();
              }}>검사 생략</Button>

              <Button onClick={runCombinationCheck} disabled={combChecking || combSelected.size===0}>
                {combChecking? '검사 중...' : '조합형/일체형 검사'}
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setSubStep('syn')}>이전 단계</Button>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setSynonymGroups(groups);
                  // 내부 플래그 제외하고 실제 결과가 있는지 확인
                  const realCombKeys = Object.keys(combResult).filter(key => !key.startsWith('_'));
                  const finalCombResult = realCombKeys.length > 0 
                    ? combResult 
                    : { _step2Completed: true };
                  setCombResult(finalCombResult as any);
                  onDone();
                }}
                disabled={combSelected.size===0 && Object.keys(combResult).filter(key => !key.startsWith('_')).length===0}
              >
                다음 단계
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(open)=>{ if(!open) setPendingMain(null); setConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="!text-center">
            <AlertDialogTitle>메인 키워드를 변경할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이전에 선택한 키워드의 메인 키워드도 함께 바뀌어요.<br />
              (새 메인 키워드로 다른 키워드를 검사하려면, 먼저 현재 검사를 완료해 주세요.)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="!justify-center !flex-row">
            <AlertDialogCancel onClick={() => {
              if(!pendingMain) return;
              const updated: Record<string,string> = { ...combMainMap };
              // 검사를 진행하지 않은 키워드만 새로운 메인 키워드 적용
              combSelected.forEach(k => { 
                if (!combResult[k]) {
                  updated[k] = pendingMain; 
                }
              });
              setCombMainMap(updated);
              setSelectedMain(pendingMain);
              setConfirmOpen(false);
              setPendingMain(null);
            }}>네, 변경할게요</AlertDialogCancel>
            <AlertDialogAction>아니요, 그대로 진행할게요</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
} 