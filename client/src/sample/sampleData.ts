// Sample data for guest users – 대저토마토 예시
export const sampleKeywordRaw = "대저토마토";
export const sampleKeywordInput = "대저토마토(예시)";

/*************************
 * 키워드 경쟁률 분석용 데이터
 *************************/
export const sampleStatsData = {
  keywordList: [
    {
      relKeyword: sampleKeywordInput,
      monthlyTotalQcCnt: 4680,
      compIdx: 35,
    },
  ],
};

const objToArr = (obj: Record<string, number>) =>
  Object.entries(obj).map(([key, value]) => ({ key, value }));

// ---- 핵심 빈도 맵 ----
const kwMap: Record<string, number> = {
  짭짤이: 17,
  완숙: 12,
  부산: 10,
  흑대추방울토마토: 7,
  흑: 7,
  찰: 7,
  대추: 7,
  방울토마토: 6,
  방울: 5,
  GAP: 4,
  찰토마토: 4,
  짭짜리: 4,
  완숙토마토: 4,
  산지직송: 4,
  못난이: 4,
};

const tagMap: Record<string, number> = {
  짭짤이: 14,
  맛있는토마토: 14,
  제철과일: 11,
  고당도과일: 6,
  건강한과일: 5,
  신선한: 4,
  주스용: 3,
  신선과일: 3,
  당뇨에좋은: 3,
};

const keywordCountMap: Record<string, number> = {
  "7": 10,
  "9": 7,
  "8": 6,
  "6": 6,
  "10": 5,
  "11": 2,
  "5": 2,
  "12": 1,
  "3": 1,
};

export const sampleCategoriesDetailed = [
  {
    categoryPath: "식품 >농산물>과일>토마토",
    count: 40,
    keywords: kwMap,
    tags: tagMap,
    keywordCounts: keywordCountMap,
    pairedData: [
      {
        attribute: "품종",
        characters: [
          { character: "대저토마토", count: 14 },
          { character: "대추방울토마토", count: 7 },
          { character: "유럽종완숙토마토", count: 5 },
          { character: "흑토마토", count: 4 },
          { character: "동양종토마토", count: 2 },
        ],
      },
      {
        attribute: "무게",
        characters: [
          { character: "2.5kg", count: 10 },
          { character: "5kg", count: 7 },
          { character: "1kg", count: 4 },
          { character: "2kg", count: 3 },
          { character: "3kg", count: 2 },
        ],
      },
    ],
    excludedQuery: ["토마토", "대저", "대저토마토"],
    excludedNumbers: [
      "2.5kg",
      "5kg",
      "1kg",
      "2kg",
      "3kg",
      "500g",
      "19kg",
    ],
    excludedBrands: ["싱그러움농장"],
    excludedTags: ["오늘출발", "오늘발송", "정기구독", "정기배송"],
  },
];

// 최소 리뷰 제품들 및 리뷰 통계 계산용 products 배열 (30,32,26위)
export const sampleProducts = [
  { rank: 30, rankReviewCount: 1, isBundleProduct: false },
  { rank: 32, rankReviewCount: 1, isBundleProduct: false },
  { rank: 26, rankReviewCount: 2, isBundleProduct: false },
];

export const sampleAnalysisData = {
  keywords: objToArr(kwMap),
  tags: objToArr(tagMap),
  keywordCounts: objToArr(keywordCountMap),
  categories: objToArr({ "식품 >농산물>과일>토마토": 40 }),
  categoriesDetailed: sampleCategoriesDetailed,
  products: sampleProducts,
};

/*************************
 * 빠른 상품명 최적화 – AI 결과
 *************************/
export const sampleQuickAIResult = {
  productName: "부산 대저토마토 GAP 완숙 흑대추방울토마토 짭짤이 찰",
  reason:
    `판매 상품에 맞는 브랜드, 용량, 수량, 시리즈 등을 검색하거나 변경해 활용하세요)
* 네이버 상품명 SEO 규칙 준수 \"브랜드/제조사-시리즈-모델명-상품 유형-색상-소재-패키지 수량-사이즈-성별 나이 표현-속성-판매옵션\" 순서로 조합.
1. 필수 키워드 \"대저토마토\"를 원본 그대로 포함
2. 상위 키워드 중요도 순서 반영
   - 지역 특성 \"부산\" 첫 배치
   - GAP 인증 강조
   - \"완숙\" 품질 강조
   - \"흑대추방울토마토\" 특별한 품종 강조
   - \"짭짤이\" 맛 특성 부각
   - \"찰\" 토마토 품질 추가

3. 키워드 배치 최적화
   - 필수 키워드와 상위 키워드 분산 배치
   - 7개 단어 정확히 사용
   - 동일 단어 반복 없음
   - 원본 키워드 그대로 사용

4. 소비자 검색 의도 반영
   - 지역, 품종, 품질, 맛 등 다양한 검색 키워드 포함`,
  recommendedTags: [
    "짭짤이",
    "맛있는토마토",
    "제철과일",
    "고당도과일",
    "건강한과일",
    "신선한",
    "주스용",
    "당뇨에좋은",
    "신선과일",
    "못난이",
    "찰토마토",
  ],
  recommendedCategories: ["식품>농산물>과일>토마토"],
  keyword: sampleKeywordInput,
  pageIndex: 1,
};

/*************************
 * 완벽한 상품명 최적화 – Step2 & Step3 예시
 *************************/
// Synonym groups – 각 키워드가 다른 키워드로 판정된 형태
export const sampleSynGroups = (
  [
    sampleKeywordRaw,
    "토마토",
    "대저",
    "흑대추방울토마토",
    "방울토마토",
    "짭짜리",
    "짭짤이",
    "완숙",
    "완숙토마토",
    "찰토마토",
    "찰",
  ] as string[]
).map((kw, idx) => ({ id: idx + 1, keywords: [kw], merged: false as const }));

export const sampleStep3Data = {
  productNames: [
    "부산 대저 짭짤이 GAP 완숙 토마토 흑대추방울",
  ],
  reason:
    `(판매 상품에 맞는 브랜드, 용량, 수량, 시리즈 등을 검색하거나 변경해 활용하세요)\n* 네이버 상품명 SEO 규칙 준수 ...`,
  tags: [
    "짭짤이토마토",
    "맛있는토마토",
    "제철과일",
    "고당도과일",
    "건강한과일",
    "신선한",
    "주스용",
    "당뇨에좋은",
    "신선과일",
    "찰토마토",
    "못난이",
    "산지직송",
    "짭짜리",
  ],
  categories: ["식품>농산물>과일>토마토"],
};

export const sampleCompleteOptimizerData = {
  currentStep: 2,
  step2Data: {
    synonymGroups: sampleSynGroups,
    combResult: {},
    selectedMain: sampleKeywordRaw,
    combMainMap: {},
  },
  step3Data: sampleStep3Data,
}; 