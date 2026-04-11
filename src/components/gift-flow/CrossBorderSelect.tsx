import { useEffect, useState } from "react";
import { Globe2, MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORTED_COUNTRIES, detectUserCountry } from "@/lib/geoConfig";

interface CrossBorderSelectProps {
  recipientName: string;
  recipientCountry: string | null;
  onChange: (country: string | null) => void;
  savedCountry: string | null;
}

export default function CrossBorderSelect({
  recipientName,
  recipientCountry,
  onChange,
  savedCountry,
}: CrossBorderSelectProps) {
  const userCountry = detectUserCountry();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"same" | "different">("same");

  useEffect(() => {
    const isDifferent = Boolean(savedCountry && savedCountry !== userCountry);
    if (isDifferent) {
      setExpanded(true);
      setMode("different");
      onChange(savedCountry);
    } else if (!recipientCountry) {
      setMode("same");
    }
  }, [onChange, recipientCountry, savedCountry, userCountry]);

  const activeCountryCode = mode === "same" ? userCountry : recipientCountry;
  const activeCountry = SUPPORTED_COUNTRIES.find((country) => country.code === activeCountryCode);

  if (!expanded) {
    return (
      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Gifting within your country for {recipientName}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            Change
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Globe2 className="h-4 w-4 text-primary" />
          Delivery country for {recipientName}
        </div>

        <RadioGroup
          value={mode}
          onValueChange={(value) => {
            const next = value as "same" | "different";
            setMode(next);
            if (next === "same") {
              onChange(null);
            } else if (!recipientCountry) {
              onChange(savedCountry && savedCountry !== userCountry ? savedCountry : "US");
            }
          }}
          className="grid gap-3"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <RadioGroupItem id="same-country" value="same" />
            <Label htmlFor="same-country" className="cursor-pointer">
              Same country
            </Label>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <RadioGroupItem id="different-country" value="different" />
            <Label htmlFor="different-country" className="cursor-pointer">
              Different country
            </Label>
          </div>
        </RadioGroup>

        {mode === "different" && (
          <div className="space-y-3">
            <Select value={recipientCountry ?? ""} onValueChange={(value) => onChange(value || null)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Choose delivery country" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.flag} {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {activeCountry && (
              <p className="rounded-xl bg-background px-4 py-3 text-sm text-foreground">
                We&apos;ll show stores for {activeCountry.name} {activeCountry.flag}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
