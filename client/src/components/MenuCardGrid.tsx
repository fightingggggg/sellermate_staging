import React from "react";
import MenuCard from "./MenuCard";

export interface MenuCardItem {
  id: string;
  title: string;
  description: string;
  href: string;
  activeColor: "green" | "blue" | "sky" | "purple";
  showBadge?: boolean;
  badgeText?: string;
}

interface MenuCardGridProps {
  currentPageId: string;
  onCardClick: (e: React.MouseEvent, path: string) => void;
  cards?: MenuCardItem[];
}

const DEFAULT_CARDS: MenuCardItem[] = [
  {
    id: "keyword-analysis",
    title: "키워드 경쟁률 분석",
    description: "어떤 키워드가\n상위 노출에 유리할까?",
    href: "/keyword-competition-analysis",
    activeColor: "green"
  },
  {
    id: "complete-optimizer",
    title: "완벽한 상품명 최적화",
    description: "검색 로직까지 고려한\n상품명·태그·속성 최적화!",
    href: "/product-optimizer/complete",
    activeColor: "blue"
  },
  {
    id: "quick-optimizer",
    title: "빠른 상품명 최적화",
    description: "클릭 한 번이면\n 상품명,태그,속성 최적화!",
    href: "/product-optimizer/quick",
    activeColor: "sky"
  },
  {
    id: "original-optimizer",
    title: "상품명 그대로 최적화",
    description: "상품명 단어 순서만 바꿔도\n순위 상승!",
    href: "/product-optimizer/original",
    activeColor: "purple",
    showBadge: true,
    badgeText: "Beta"
  }
];

export default function MenuCardGrid({ 
  currentPageId, 
  onCardClick, 
  cards = DEFAULT_CARDS 
}: MenuCardGridProps) {
  return (
    <div className="grid md:grid-cols-4 gap-4 mb-6 max-w-3xl mx-auto">
      {cards.map((card) => (
        <MenuCard
          key={card.id}
          title={card.title}
          description={card.description}
          href={card.href}
          isActive={card.id === currentPageId}
          activeColor={card.activeColor}
          onClick={onCardClick}
          showBadge={card.showBadge}
          badgeText={card.badgeText}
        />
      ))}
    </div>
  );
} 