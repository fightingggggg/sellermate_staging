import React from "react";

interface StepperHeaderProps {
  current: 1 | 2 | 3;
}

const steps = [
  { id: 1 as const, label: "상위 노출 상품 분석해 실제 상위 키워드·태그 파악" },
  { id: 2 as const, label: "검색 로직 기반으로 동의어, 조합형 키워드 정리" },
  { id: 3 as const, label: "네이버 SEO에 맞춘 최적 상품명·태그·카테고리 제안" },
];

export default function StepperHeader({ current }: StepperHeaderProps) {
  // 현재 단계를 그대로 표시
  const displayCurrent = current;
  
  return (
    <div
      className="flex flex-col sm:flex-row items-start sm:items-center justify-center gap-2 sm:gap-4 py-3 sticky top-16 bg-blue-50 border border-blue-200 shadow-sm rounded-lg z-30 backdrop-blur supports-[backdrop-filter]:bg-blue-50/80 sm:min-w-[1100px] sm:self-center"
    >
      {steps.map((s, idx) => (
        <React.Fragment key={s.id}>
          {/* Step item */}
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
              ${displayCurrent === s.id
                ? "bg-primary text-primary-foreground"
                : displayCurrent > s.id
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground"}`}
            >
              {s.id}
            </div>
            <span className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap sm:whitespace-nowrap">
              {s.label}
            </span>
          </div>

          {/* Connector (hidden on mobile) */}
          {idx < steps.length - 1 && (
            <div className="hidden sm:block w-6 h-px bg-border" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
} 