import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="mb-8">
        <div className="text-9xl font-extrabold text-blue-600 opacity-20 mb-[-3rem]">404</div>
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">페이지를 찾을 수 없습니다</h1>
      </div>
      
      <p className="text-slate-600 mb-8 max-w-lg">
        요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다. 주소를 확인하시거나 아래 버튼을 통해 홈페이지로 이동하세요.
      </p>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <Button 
          variant="outline" 
          onClick={() => window.history.back()}
          className="border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          이전 페이지로
        </Button>
        
        <Button 
          onClick={() => navigate("/")}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        >
          <Home className="mr-2 h-4 w-4" />
          홈으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
