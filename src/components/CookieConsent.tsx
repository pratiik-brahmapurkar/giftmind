import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { initPosthog, trackEvent } from "@/lib/posthog";
import { useFlag } from "@/hooks/useAppSettings";

const COOKIE_KEY = "gm_cookie_consent";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const consentRequired = useFlag("feature_cookie_consent_required", true);
  const posthogEnabled = useFlag("feature_posthog_enabled", true);

  useEffect(() => {
    if (!consentRequired) {
      initPosthog({ enabled: posthogEnabled, requireConsent: false });
      setVisible(false);
      return;
    }
    const saved = localStorage.getItem(COOKIE_KEY);
    if (!saved) setVisible(true);
    if (saved === "accepted") initPosthog({ enabled: posthogEnabled, requireConsent: true });
  }, [consentRequired, posthogEnabled]);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, "accepted");
    setVisible(false);
    initPosthog({ enabled: posthogEnabled, requireConsent: true });
    trackEvent("cookie_consent_accepted");
  };

  const decline = () => {
    trackEvent("cookie_consent_declined");
    localStorage.setItem(COOKIE_KEY, "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 left-4 right-4 z-50 flex justify-center sm:bottom-4">
      <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-border bg-card/95 backdrop-blur-sm p-4 shadow-lg flex flex-col sm:flex-row items-center gap-3">
        <p className="text-sm text-muted-foreground text-center sm:text-left flex-1">
          We use analytics cookies to improve GiftMind. No advertising cookies.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={accept}>Accept</Button>
          <button onClick={decline} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2">
            Decline
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
