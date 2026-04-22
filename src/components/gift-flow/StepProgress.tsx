import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const labels = ["Person", "Occasion", "Budget", "Context", "Results"];

interface StepProgressProps {
  currentStep: number;
}

export default function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="sticky top-0 z-10 space-y-2 bg-background py-2">
      {/* Mobile step indicator — visible < 400px */}
      <p className="text-center text-xs font-medium text-muted-foreground sm:hidden" aria-live="polite">
        Step {currentStep} of {labels.length}
      </p>

      <div className="flex items-center" role="list" aria-label="Gift flow progress">
        {labels.map((label, index) => {
          const step = index + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={label} className="flex flex-1 items-center last:flex-initial" role="listitem">
              <div className="flex flex-col items-center gap-2">
                <div
                  role="status"
                  tabIndex={0}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`${label}: ${isCompleted ? "completed" : isCurrent ? "current step" : "upcoming"}`}
                  className={cn(
                    "flex items-center justify-center rounded-full border text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    isCompleted && "h-9 w-9 border-primary bg-primary text-primary-foreground",
                    isCurrent && "h-10 w-10 border-primary bg-primary text-primary-foreground shadow-md",
                    !isCompleted && !isCurrent && "h-9 w-9 border-muted-foreground/30 bg-background text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step}
                </div>
                <span
                  className={cn(
                    "hidden text-xs md:block",
                    isCompleted && "text-primary",
                    isCurrent && "font-medium text-primary",
                    !isCompleted && !isCurrent && "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>

              {step < labels.length && (
                <div className="mx-3 flex-1">
                  <div
                    className={cn(
                      "h-px w-full transition-colors duration-300",
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
