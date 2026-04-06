import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { SUPPORTED_COUNTRIES, detectUserCountry, type SupportedCountry } from "./constants";

interface CrossBorderSectionProps {
  recipientName: string;
  recipientCountry: string;
  onCountryChange: (country: string) => void;
}

const CrossBorderSection = ({
  recipientName,
  recipientCountry,
  onCountryChange,
}: CrossBorderSectionProps) => {
  const userCountry = detectUserCountry();
  const userCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === userCountry);

  const hasSavedCountry = !!recipientCountry && recipientCountry !== userCountry;
  const [expanded, setExpanded] = useState(hasSavedCountry);
  const [mode, setMode] = useState<"same" | "different">(
    hasSavedCountry ? "different" : "same"
  );

  // If recipient already has a saved country that's different, auto-expand
  useEffect(() => {
    if (recipientCountry && recipientCountry !== userCountry) {
      setExpanded(true);
      setMode("different");
    }
  }, [recipientCountry, userCountry]);

  const selectedCountryObj = SUPPORTED_COUNTRIES.find((c) => c.code === recipientCountry);

  const handleModeChange = (val: string) => {
    if (val === "same") {
      setMode("same");
      onCountryChange(userCountry);
      setExpanded(false);
    } else {
      setMode("different");
    }
  };

  const handleCountrySelect = (code: string) => {
    onCountryChange(code);
  };

  const tier1 = SUPPORTED_COUNTRIES.filter((c) => c.tier === 1);
  const tier2 = SUPPORTED_COUNTRIES.filter((c) => c.tier === 2);
  const tier3 = SUPPORTED_COUNTRIES.filter((c) => c.tier === 3);
  const tier4 = SUPPORTED_COUNTRIES.filter((c) => c.tier === 4);

  const showConfirmation = mode === "different" && recipientCountry && recipientCountry !== userCountry;

  return (
    <div className="mt-4">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 border border-border/50 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Gifting within your country {userCountryObj ? `(${userCountryObj.flag} ${userCountryObj.name})` : ""}
          </span>
          <span className="text-xs text-primary font-medium">Change</span>
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Where is {recipientName || "the recipient"} located?
              </p>

              <RadioGroup value={mode} onValueChange={handleModeChange} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="same" id="same-country" />
                  <Label htmlFor="same-country" className="text-sm cursor-pointer">
                    Same country as me {userCountryObj ? `(${userCountryObj.flag} ${userCountryObj.name})` : ""}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="different" id="different-country" />
                  <Label htmlFor="different-country" className="text-sm cursor-pointer">
                    Different country
                  </Label>
                </div>
              </RadioGroup>

              {mode === "different" && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Select
                    value={recipientCountry || ""}
                    onValueChange={handleCountrySelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="🔍 Select country" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground">Popular</SelectLabel>
                        {tier1.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.flag} {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground">Europe</SelectLabel>
                        {tier2.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.flag} {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-xs text-muted-foreground">Asia Pacific & Americas</SelectLabel>
                        {tier3.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.flag} {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator />
                      {tier4.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {showConfirmation && selectedCountryObj && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 text-sm text-[hsl(168,100%,30%)] bg-[hsl(168,100%,36%)]/10 rounded-lg p-3"
                >
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Got it! We'll show stores that deliver to {selectedCountryObj.name} {selectedCountryObj.flag} and adapt our recommendations to {selectedCountryObj.demonym} gifting norms.
                  </span>
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default CrossBorderSection;
