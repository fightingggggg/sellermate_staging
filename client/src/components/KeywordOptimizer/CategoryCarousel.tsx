import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Tag, ListOrdered, Hash, Layers } from "lucide-react";

interface KV { key: string; value: number }
interface ProductInfo { title?: string; name?: string }
interface CategoryDetail {
  categoryName?: string;
  categoryPath?: string;
  name?: string;
  keywords?: KV[];
  keywordCounts?: KV[];
  tags?: KV[];
  products?: ProductInfo[];
}

interface CarouselProps {
  categories: CategoryDetail[];
}

const RankedList = ({ items, unit = "회" }: { items: KV[]; unit?: string }) => (
  <ul className="space-y-1 text-sm">
    {items.map((item, idx) => (
      <li key={idx} className="flex justify-between">
        <span className="flex items-center">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-medium mr-2">
            {idx + 1}
          </span>
          {item.key}
        </span>
        <span className="text-gray-500 whitespace-nowrap">
          {item.value}
          {unit}
        </span>
      </li>
    ))}
  </ul>
);

export default function CategoryCarousel({ categories }: CarouselProps) {
  const [index, setIndex] = useState(0);
  const total = categories.length;
  const current = categories[index] || {};

  const title =
    current.categoryName || current.categoryPath || current.name || `카테고리 ${index + 1}`;

  const safeArr = (arr?: any): KV[] => {
    if (!arr) return [];
    if (Array.isArray(arr)) {
      return arr
        .filter((it) => (it.key || it.label || it.word || "").toString().trim() !== "")
        .slice(0, 12)
        .map((it: any) => ({
          key: String(it.key ?? it.label ?? it.word ?? ""),
          value: Number(it.value ?? it.count ?? 0),
        }));
    }
    return [];
  };

  const keywords = safeArr((current as any).keywords);
  const keywordCounts = safeArr((current as any).keywordCounts)
    .sort((a, b) => (b.value === a.value ? Number(b.key) - Number(a.key) : b.value - a.value))
    .map((it) => ({ key: `${it.key}개`, value: it.value }));
  const tags = safeArr((current as any).tags).sort((a, b) => (b.value === a.value ? 0 : b.value - a.value));
  const products: ProductInfo[] = Array.isArray((current as any).products)
    ? (current as any).products.slice(0, 5)
    : [];

  return (
    <Card className="border border-blue-200">
      <CardHeader className="flex items-center justify-between gap-4">
        <button
          disabled={total <= 1}
          onClick={() => setIndex((index - 1 + total) % total)}
          className="p-1 disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5 text-blue-600" />
        </button>
        <CardTitle className="text-blue-700 flex-1 text-center truncate">
          {title}
        </CardTitle>
        <button
          disabled={total <= 1}
          onClick={() => setIndex((index + 1) % total)}
          className="p-1 disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-blue-600" />
        </button>
      </CardHeader>

      <CardContent className="space-y-6">
        {keywords.length > 0 && (
          <>
            <h4 className="flex items-center gap-1 text-base font-semibold text-blue-700">
              <Tag className="w-4 h-4" /> 상위 키워드
            </h4>
            <div className="text-xs text-gray-600 mb-1">순위 | 키워드 | 빈도</div>
            <RankedList items={keywords} />
            <Separator className="my-4" />
          </>
        )}

        {keywordCounts.length > 0 && (
          <>
            <h4 className="flex items-center gap-1 text-base font-semibold text-blue-700">
              <ListOrdered className="w-4 h-4" /> 키워드 개수
            </h4>
            <div className="text-xs text-gray-600 mb-1">순위 | 개수 | 빈도</div>
            <RankedList items={keywordCounts} />
            <Separator className="my-4" />
          </>
        )}

        {tags.length > 0 && (
          <>
            <h4 className="flex items-center gap-1 text-base font-semibold text-blue-700">
              <Hash className="w-4 h-4" /> 태그
            </h4>
            <div className="text-xs text-gray-600 mb-1">순위 | 태그 | 빈도</div>
            <RankedList items={tags} />
            <Separator className="my-4" />
          </>
        )}

        {products.length > 0 && (
          <>
            <h4 className="flex items-center gap-1 text-base font-semibold text-blue-700">
              <Layers className="w-4 h-4" /> 상품 주요정보
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {products.map((p, i) => (
                <li key={i} className="truncate">
                  {p.title || p.name || "-"}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
} 