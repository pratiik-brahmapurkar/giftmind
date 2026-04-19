import { useState, useEffect } from 'react';

export function calculateProfileCompletion(params: {
  full_name: string | null;
  country: string | null;
  birthday: string | null;
  recipient_count: number;
  audience: string[];
  gift_style: string[];
}): number {
  let score = 0;
  if (params.full_name && params.full_name.trim().length >= 2) score += 20;
  if (params.country && params.country.trim() !== '') score += 20;
  if (params.recipient_count >= 1) score += 25;
  if (params.audience && params.audience.length > 0) score += 15;
  if (params.birthday) score += 10;
  if (params.gift_style && params.gift_style.length > 0) score += 10;
  return Math.min(score, 100);
}

export function getMissingFields(params: {
  full_name: string | null;
  country: string | null;
  birthday: string | null;
  recipient_count: number;
  audience: string[];
  gift_style: string[];
}): string[] {
  const missing = [];
  if (!params.full_name || params.full_name.trim().length < 2) missing.push('name');
  if (!params.country || params.country.trim() === '') missing.push('country');
  if (params.recipient_count < 1) missing.push('recipients');
  if (!params.audience || params.audience.length === 0) missing.push('gifting audience');
  if (!params.birthday) missing.push('birthday');
  if (!params.gift_style || params.gift_style.length === 0) missing.push('gift style preferences');
  return missing;
}

export function useProfileCompletion(completionPct: number) {
  const [shouldShowBanner, setShouldShowBanner] = useState(false);

  useEffect(() => {
    if (completionPct >= 100) {
      setShouldShowBanner(false);
      return;
    }

    const dismissedTs = localStorage.getItem("gm_dismissed_profile_banner_ts");
    if (dismissedTs) {
      const isExpired = Date.now() - parseInt(dismissedTs, 10) > 7 * 24 * 60 * 60 * 1000;
      if (!isExpired) {
        setShouldShowBanner(false);
        return;
      }
    }

    setShouldShowBanner(true);
  }, [completionPct]);

  const dismissBanner = () => {
    localStorage.setItem("gm_dismissed_profile_banner_ts", Date.now().toString());
    setShouldShowBanner(false);
  };

  return { shouldShowBanner, dismissBanner };
}
