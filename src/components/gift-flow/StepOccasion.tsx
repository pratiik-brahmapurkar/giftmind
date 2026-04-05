import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { OCCASIONS } from "./constants";
import { cn } from "@/lib/utils";

interface StepOccasionProps {
  selected: string;
  onSelect: (val: string) => void;
  occasionDate: string;
  onDateChange: (val: string) => void;
}

const StepOccasion = ({ selected, onSelect, occasionDate, onDateChange }: StepOccasionProps) => {
  const dateValue = occasionDate ? new Date(occasionDate) : undefined;

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

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
        {OCCASIONS.map((o) => (
          <Card
            key={o.value}
            className={cn(
              "cursor-pointer border-2 transition-all hover:shadow-md text-center",
              selected === o.value
                ? "border-primary shadow-md bg-primary/5"
                : "border-border/50 hover:border-primary/30"
            )}
            onClick={() => onSelect(o.value)}
          >
            <CardContent className="p-3 md:p-4">
              <span className="text-2xl md:text-3xl block mb-1">{o.emoji}</span>
              <span className="text-[10px] md:text-xs font-medium text-foreground leading-tight">
                {o.label}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Date picker */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">When is it? (optional)</label>
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
      </div>
    </div>
  );
};

export default StepOccasion;
