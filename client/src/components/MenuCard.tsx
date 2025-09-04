import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface MenuCardProps {
  title: string;
  description: string;
  href: string;
  isActive: boolean;
  activeColor: "green" | "blue" | "sky" | "purple";
  onClick: (e: React.MouseEvent, path: string) => void;
  showBadge?: boolean;
  badgeText?: string;
}

export default function MenuCard({ 
  title, 
  description, 
  href, 
  isActive, 
  activeColor,
  onClick, 
  showBadge = false, 
  badgeText = "Beta" 
}: MenuCardProps) {
  const getColorClasses = () => {
    const colorMap = {
      green: {
        active: "border-2 border-green-500",
        hover: "hover:border-green-400"
      },
      blue: {
        active: "border-2 border-blue-500",
        hover: "hover:border-blue-400"
      },
      sky: {
        active: "border-2 border-sky-500",
        hover: "hover:border-sky-400"
      },
      purple: {
        active: "border-2 border-purple-500",
        hover: "hover:border-purple-400"
      }
    };

    if (isActive) {
      return {
        border: colorMap[activeColor].active,
        hover: "",
        opacity: ""
      };
    } else {
      return {
        border: "border",
        hover: colorMap[activeColor].hover,
        opacity: "opacity-50 hover:opacity-100"
      };
    }
  };

  const colorClasses = getColorClasses();

  return (
    <Link href={href} onClick={(e: any) => onClick(e, href)}>
      <Card className={`${colorClasses.border} ${colorClasses.hover} shadow-sm hover:shadow-md transition ${colorClasses.opacity} h-full flex flex-col ${showBadge ? 'relative' : ''}`}>
        {showBadge && (
          <Badge variant="secondary" className={`absolute -top-2 -right-2 text-xs px-2 py-0.5 z-10 ${
            activeColor === 'green' ? 'bg-green-100 text-green-700' :
            activeColor === 'blue' ? 'bg-blue-100 text-blue-700' :
            activeColor === 'sky' ? 'bg-sky-100 text-sky-700' :
            'bg-purple-100 text-purple-700'
          }`}>
            {badgeText}
          </Badge>
        )}
        <CardHeader className="py-2">
          <CardTitle className="text-base font-bold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-2">
          <CardDescription className="text-xs text-gray-600 whitespace-pre-line">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
} 