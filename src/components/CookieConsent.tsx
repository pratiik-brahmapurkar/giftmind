import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const COOKIE_KEY = "gm_cookie_consent";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(COOKIE_KEY);
    if (!saved) setVisible(true);
    if (saved === "accepted") loadPosthog();
  }, []);

  const loadPosthog = () => {
    // Posthog init placeholder — replace with real key when ready
  };

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, "accepted");
    setVisible(false);
    loadPosthog();
  };

  const decline = () => {
    localStorage.setItem(COOKIE_KEY, "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
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
