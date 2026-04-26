import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const labels = ["Person", "Occasion", "Budget", "Context", "Results"];

interface StepProgressProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export default function StepProgress({ currentStep, onStepClick }: StepProgressProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      {/* Mobile step indicator — visible < 400px */}
      <p className="mb-2 text-center text-xs font-medium text-muted-foreground sm:hidden" aria-live="polite">
        Step {currentStep} of {labels.length}
      </p>

      <div className="flex items-start overflow-x-auto pb-1" role="list" aria-label="Gift flow progress">
        {labels.map((label, index) => {
          const step = index + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={label} className="flex min-w-0 flex-1 items-start last:flex-initial" role="listitem">
              <div className="flex w-16 shrink-0 flex-col items-center gap-2 md:w-20">
                <div
                  role={isCompleted && onStepClick ? "button" : "status"}
                  tabIndex={0}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`${label}: ${isCompleted ? "completed – click to go back" : isCurrent ? "current step" : "upcoming"}`}
                  onClick={isCompleted && onStepClick ? () => onStepClick(step) : undefined}
                  onKeyDown={isCompleted && onStepClick ? (e) => { if (e.key === "Enter" || e.key === " ") onStepClick(step); } : undefined}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:h-12 md:w-12",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCompleted && onStepClick && "cursor-pointer hover:opacity-75",
                    isCurrent && "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20",
                    !isCompleted && !isCurrent && "border-muted-foreground/30 bg-background text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step}
                </div>
                <span
                  className={cn(
                    "text-center text-xs font-medium",
                    isCompleted && "text-primary",
                    isCurrent && "font-medium text-primary",
                    !isCompleted && !isCurrent && "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>

              {step < labels.length && (
                <div className="mx-2 mt-[22px] min-w-8 flex-1 md:mx-4 md:mt-6">
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
