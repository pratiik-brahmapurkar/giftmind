import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const labels = ["Person", "Occasion", "Budget", "Context", "Results"];

interface StepProgressProps {
  currentStep: number;
}

export default function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        {labels.map((label, index) => {
          const step = index + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={label} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "h-10 w-10 border-primary bg-primary text-primary-foreground shadow-md",
                    !isCompleted && !isCurrent && "border-muted-foreground/30 bg-background text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step}
                </div>
                <span className="hidden text-xs text-muted-foreground md:block">{label}</span>
              </div>

              {step < labels.length && (
                <div className="mx-3 flex-1">
                  <div
                    className={cn(
                      "h-px w-full",
                      step < currentStep ? "bg-primary" : "border-t border-dashed border-muted-foreground/30",
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
