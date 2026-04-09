import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { COUNTRY_OPTIONS } from "@/components/recipients/constants";

interface StepOccasionProps {
  selected: string;
  onSelect: (val: string) => void;
  occasionDate: string;
  onDateChange: (val: string) => void;
  targetCountry?: string;
}

const UNIVERSAL_OCCASIONS = [
  { value: 'birthday', emoji: '🎂', label: 'Birthday' },
  { value: 'anniversary', emoji: '💍', label: 'Anniversary' },
  { value: 'valentines', emoji: '❤️', label: "Valentine's Day" },
  { value: 'wedding', emoji: '💒', label: 'Wedding' },
  { value: 'baby_shower', emoji: '🍼', label: 'Baby Shower' },
  { value: 'housewarming', emoji: '🏠', label: 'Housewarming' },
  { value: 'graduation', emoji: '🎓', label: 'Graduation' },
  { value: 'thank_you', emoji: '🙏', label: 'Thank You' },
  { value: 'just_because', emoji: '💝', label: 'Just Because' },
  { value: 'christmas', emoji: '🎄', label: 'Christmas' },
  { value: 'corporate', emoji: '👔', label: 'Corporate Gift' },
  { value: 'secret_santa', emoji: '🎅', label: 'Secret Santa' },
];

const REGIONAL_OCCASIONS: Record<string, Array<{value: string, emoji: string, label: string}>> = {
  IN: [
    { value: 'diwali', emoji: '🪔', label: 'Diwali' },
    { value: 'holi', emoji: '🎨', label: 'Holi' },
    { value: 'raksha_bandhan', emoji: '🪢', label: 'Raksha Bandhan' },
    { value: 'karwa_chauth', emoji: '🌙', label: 'Karwa Chauth' },
    { value: 'ganesh_chaturthi', emoji: '🙏', label: 'Ganesh Chaturthi' },
  ],
  US: [
    { value: 'thanksgiving', emoji: '🦃', label: 'Thanksgiving' },
    { value: 'halloween', emoji: '🎃', label: 'Halloween' },
    { value: 'hanukkah', emoji: '🕎', label: 'Hanukkah' },
    { value: 'mothers_day', emoji: '💐', label: "Mother's Day" },
    { value: 'fathers_day', emoji: '👔', label: "Father's Day" },
  ],
  GB: [
    { value: 'boxing_day', emoji: '🎁', label: 'Boxing Day' },
    { value: 'mothers_day', emoji: '💐', label: "Mother's Day" },
    { value: 'fathers_day', emoji: '👔', label: "Father's Day" },
    { value: 'eid', emoji: '🌙', label: 'Eid' },
    { value: 'diwali', emoji: '🪔', label: 'Diwali' },
  ],
  AE: [
    { value: 'eid_al_fitr', emoji: '🌙', label: 'Eid al-Fitr' },
    { value: 'eid_al_adha', emoji: '🐑', label: 'Eid al-Adha' },
    { value: 'ramadan', emoji: '☪️', label: 'Ramadan' },
    { value: 'national_day', emoji: '🇦🇪', label: 'UAE National Day' },
  ],
  FR: [
    { value: 'fete_nationale', emoji: '🇫🇷', label: 'Bastille Day' },
    { value: 'epiphany', emoji: '👑', label: 'Epiphany' },
    { value: 'mothers_day', emoji: '💐', label: "Fête des Mères" },
    { value: 'fathers_day', emoji: '👔', label: "Fête des Pères" },
  ],
  DE: [
    { value: 'nikolaus', emoji: '🎅', label: 'Nikolaus' },
    { value: 'oktoberfest', emoji: '🍺', label: 'Oktoberfest' },
    { value: 'mothers_day', emoji: '💐', label: 'Muttertag' },
    { value: 'fathers_day', emoji: '👔', label: 'Vatertag' },
  ],
  NL: [
    { value: 'sinterklaas', emoji: '🎅', label: 'Sinterklaas' },
    { value: 'kings_day', emoji: '👑', label: "King's Day" },
  ],
  SG: [
    { value: 'chinese_new_year', emoji: '🧧', label: 'Chinese New Year' },
    { value: 'hari_raya', emoji: '🌙', label: 'Hari Raya' },
    { value: 'deepavali', emoji: '🪔', label: 'Deepavali' },
  ],
  CA: [
    { value: 'thanksgiving_ca', emoji: '🦃', label: 'Thanksgiving' },
    { value: 'canada_day', emoji: '🇨🇦', label: 'Canada Day' },
    { value: 'mothers_day', emoji: '💐', label: "Mother's Day" },
    { value: 'fathers_day', emoji: '👔', label: "Father's Day" },
  ],
  AU: [
    { value: 'australia_day', emoji: '🇦🇺', label: 'Australia Day' },
    { value: 'anzac_day', emoji: '🌺', label: 'ANZAC Day' },
    { value: 'mothers_day', emoji: '💐', label: "Mother's Day" },
    { value: 'fathers_day', emoji: '👔', label: "Father's Day" },
  ],
};

const StepOccasion = ({ selected, onSelect, occasionDate, onDateChange, targetCountry = "US" }: StepOccasionProps) => {
  const dateValue = occasionDate ? new Date(occasionDate) : undefined;
  const [notSure, setNotSure] = useState(false);
  const regionalOccasions = REGIONAL_OCCASIONS[targetCountry] || [];
  const countryData = COUNTRY_OPTIONS.find((c) => c.value === targetCountry);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          What's the occasion?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick the event or reason for the gift
        </p>
      </div>

      {/* Section 1: Universal */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          All occasions
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {UNIVERSAL_OCCASIONS.map((o) => (
            <Card
              key={o.value}
              className={cn(
                "cursor-pointer border-2 transition-all text-center",
                selected === o.value
                  ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.03]"
                  : "border-border/50 hover:border-primary/30 hover:shadow-sm"
              )}
              onClick={() => onSelect(o.value)}
            >
              <CardContent className="p-3">
                <span className="text-2xl block mb-1">{o.emoji}</span>
                <span className={cn(
                  "text-[10px] md:text-xs font-medium leading-tight",
                  selected === o.value ? "text-primary-foreground" : "text-foreground"
                )}>
                  {o.label}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section 2: Regional */}
      {regionalOccasions.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span>{countryData?.flag || ""} Popular in {countryData?.label || targetCountry}</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {regionalOccasions.map((o) => (
              <Card
                key={o.value}
                className={cn(
                  "cursor-pointer border-2 transition-all text-center h-[72px] flex items-center justify-center", // slightly smaller card
                  selected === o.value
                    ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.03]"
                    : "border-border/50 hover:border-primary/30 hover:shadow-sm"
                )}
                onClick={() => onSelect(o.value)}
              >
                <CardContent className="p-2 w-full">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-lg leading-none">{o.emoji}</span>
                    <span className={cn(
                      "text-[10px] sm:text-[11px] font-medium leading-tight",
                      selected === o.value ? "text-primary-foreground" : "text-foreground"
                    )}>
                      {o.label}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Date picker — show after selection */}
      {selected && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">When is it?</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">I'm not sure yet</span>
              <Switch
                checked={notSure}
                onCheckedChange={(v) => {
                  setNotSure(v);
                  if (v) onDateChange("");
                }}
              />
            </div>
          </div>
          {!notSure && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full md:w-64 justify-start text-left font-normal",
                    !dateValue && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateValue ? format(dateValue, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateValue}
                  onSelect={(d) => onDateChange(d ? d.toISOString().split("T")[0] : "")}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
};

export default StepOccasion;
