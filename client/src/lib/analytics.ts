
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

import { firebaseMeasurementId } from "./firebase";

const GA_ID = ((import.meta as any).env.VITE_GA_MEASUREMENT_ID as string | undefined) || firebaseMeasurementId;
const ADS_ID = (import.meta as any).env.VITE_GADS_ID as string | undefined;
const isProd = (import.meta as any).env.PROD as boolean;

let isInitialized = false;

function ensureGtagLoaded(idForLoader: string) {
  if (typeof window === 'undefined') return;

  // dataLayer/gtag bootstrap
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    } as unknown as (...args: any[]) => void;
  }

  // Load gtag script once
  const existingScript = document.querySelector<HTMLScriptElement>('script[src^="https://www.googletagmanager.com/gtag/js"]');
  if (!existingScript) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(idForLoader)}`;
    document.head.appendChild(script);
  }
}

export function initAnalytics(): void {
  if (isInitialized) return;
  if (!GA_ID && !ADS_ID) return;

  const idForLoader = GA_ID ?? ADS_ID!;
  ensureGtagLoaded(idForLoader);

  window.gtag('js', new Date());

  if (GA_ID) {
    window.gtag('config', GA_ID, {
      send_page_view: false,
      ...(isProd ? {} : { debug_mode: 1 }),
    });
  }
  if (ADS_ID) {
    window.gtag('config', ADS_ID, {
      ...(isProd ? {} : { debug_mode: 1 }),
    });
  }

  isInitialized = true;
}

export function trackPageView(path?: string): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  const page_path = path ?? `${window.location.pathname}${window.location.search}`;
  const page_location = window.location.href;
  const page_title = document.title;
  window.gtag('event', 'page_view', {
    page_title,
    page_location,
    page_path,
  });
}

export const trackEvent = (
  category: string,
  action: string,
  label?: string | null,
  params: Record<string, any> = {}
) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label ?? undefined,
      ...(isProd ? {} : { debug_mode: 1 }),
      ...params,
    });
  }
};

export const trackTimeSpent = (section: string, context?: { page_title?: string; page_path?: string }) => {
  // Disabled: time_spent 이벤트 전송 중지
  // const startTime = Date.now();
  // const logAndTrack = () => {
  //   const timeSpent = Math.floor((Date.now() - startTime) / 1000);
  //   const page_title = context?.page_title ?? (typeof document !== 'undefined' ? document.title : undefined);
  //   const page_path = context?.page_path ?? (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined);
  //   trackEvent('Section Time', 'time_spent', section, {
  //     seconds: timeSpent,
  //     ...(page_title ? { page_title } : {}),
  //     ...(page_path ? { page_path } : {}),
  //   });
  // };
  // const handleVisibilityChange = () => {
  //   if (document.hidden) {
  //     logAndTrack();
  //   }
  // };
  // document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    // document.removeEventListener('visibilitychange', handleVisibilityChange);
    // logAndTrack();
  };
};

