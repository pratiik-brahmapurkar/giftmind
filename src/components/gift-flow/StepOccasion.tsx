import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { OCCASION_GROUPS } from "./constants";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface StepOccasionProps {
  selected: string;
  onSelect: (val: string) => void;
  occasionDate: string;
  onDateChange: (val: string) => void;
}

const StepOccasion = ({ selected, onSelect, occasionDate, onDateChange }: StepOccasionProps) => {
  const dateValue = occasionDate ? new Date(occasionDate) : undefined;
  const [notSure, setNotSure] = useState(false);

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

      {OCCASION_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {group.occasions.map((o) => (
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
      ))}

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
