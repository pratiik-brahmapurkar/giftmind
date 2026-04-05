import { Info } from "lucide-react";

const AffiliateDisclaimer = () => (
  <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
    <Info className="w-3 h-3 mt-0.5 shrink-0" />
    <span>
      Prices shown are approximate and may vary. GiftMind may earn a small commission on purchases made through these links, at no extra cost to you.
    </span>
  </p>
);

export default AffiliateDisclaimer;
