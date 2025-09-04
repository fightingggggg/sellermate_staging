import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 6자리 생년월일(YYMMDD)을 받아서 만 나이를 계산합니다.
 * @param birthDate 6자리 생년월일 (예: '950601' for 1995년 6월 1일)
 * @returns 만 나이 (number)
 */
export function calculateAge(birthDate: string): number {
  if (!birthDate || birthDate.length !== 6) {
    return 0;
  }

  const year = parseInt(birthDate.substring(0, 2));
  const month = parseInt(birthDate.substring(2, 4));
  const day = parseInt(birthDate.substring(4, 6));

  // 2000년 이전 출생자 (95 -> 1995)
  // 2000년 이후 출생자 (05 -> 2005)
  const fullYear = year >= 50 ? 1900 + year : 2000 + year;

  const today = new Date();
  const birth = new Date(fullYear, month - 1, day); // month는 0-based

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  // 생일이 지나지 않았으면 나이에서 1을 빼줍니다
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * 카드 번호를 앞 4자리만 보이도록 마스킹 처리합니다.
 * @param cardNo 카드 번호 (숫자만)
 * @returns 마스킹된 카드 번호 (예: "1234 **** ****")
 */
export function maskCardNumber(cardNo: string): string {
  if (!cardNo || cardNo.length !== 16) {
    return '****-****-****-****';
  }
  
  // 앞 4자리만 보이고 나머지는 마스킹
  const first4 = cardNo.slice(0, 4);
  
  return `${first4} **** ****`;
}

/**
 * 카드 번호 앞 2자리와 마스킹된 번호를 조합하여 표시합니다.
 * @param cardNoPrefix 카드 번호 앞 2자리
 * @param cardNo 전체 카드 번호 (선택사항)
 * @returns 표시용 카드 번호 (예: "12 **** **** ****")
 */
export function formatCardNumberWithPrefix(cardNoPrefix: string, cardNo?: string): string {
  if (cardNoPrefix && cardNoPrefix.length === 2) {
    return `${cardNoPrefix} **** **** ****`;
  }
  
  if (cardNo && cardNo.length === 16) {
    return maskCardNumber(cardNo);
  }
  
  return '****-****-****-****';
}

// 한국 시간(KST, UTC+9) 기준으로 자정(00:00)부터 같은 날로 간주하는 날짜 키를 생성합니다.
export function getKSTDateKeyWith7AMCutoff(): string {
  const now = new Date();
  
  // 한국시간대로 날짜 문자열 가져오기
  const kstDateString = now.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // "YYYY. MM. DD" 형식을 "YYYY-MM-DD"로 변환
  return kstDateString.replace(/\. /g, '-').replace('.', '');
}

// 한국 시간 기준 자정(00:00)부터 같은 달로 간주하는 월 키(YYYY-MM)를 생성합니다.
export function getKSTMonthKeyWith7AMCutoff(): string {
  const now = new Date();
  
  // 한국시간대로 날짜 문자열 가져오기
  const kstDateString = now.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit'
  });
  
  // "YYYY. MM" 형식을 "YYYY-MM"로 변환
  return kstDateString.replace('. ', '-').replace('.', '');
}
