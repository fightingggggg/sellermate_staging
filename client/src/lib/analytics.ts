
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}


export const trackEvent = (
  category: string,
  action: string,
  label?: string | null,
  params: Record<string, any> = {}
) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', action, {
      event_category: category,
      event_label: label ?? undefined,
      debug_mode: 1,
      ...params,
    });
  }
};

export const trackTimeSpent = (section: string) => {
  const startTime = Date.now();

  const logAndTrack = () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[TimeSpent] Section: ${section}, Time: ${timeSpent}s`);
    trackEvent('Section Time', 'time_spent', `${section}: ${timeSpent}s`);
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      logAndTrack();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    logAndTrack();
  };
};

