import { STEP_LABELS } from "./constants";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StepperProps {
  currentStep: number;
}

const GiftFlowStepper = ({ currentStep }: StepperProps) => {
  return (
    <div className="flex items-center justify-between w-full max-w-lg mx-auto py-4">
      {STEP_LABELS.map((label, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "rounded-full flex items-center justify-center font-semibold transition-all duration-300",
                      isCompleted && "w-9 h-9 bg-primary text-primary-foreground",
                      isCurrent && "w-11 h-11 bg-primary text-primary-foreground shadow-lg shadow-primary/30",
                      isFuture && "w-9 h-9 border-2 border-muted-foreground/30 text-muted-foreground/50"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-sm">{i + 1}</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="md:hidden">
                  {label}
                </TooltipContent>
              </Tooltip>
              <span
                className={cn(
                  "hidden md:block text-[11px] mt-1.5 font-medium transition-colors",
                  isCompleted && "text-primary",
                  isCurrent && "text-primary",
                  isFuture && "text-muted-foreground/50"
                )}
              >
                {label}
              </span>
            </div>

            {/* Connecting line */}
            {i < STEP_LABELS.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 rounded-full bg-muted-foreground/20 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: isCompleted ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GiftFlowStepper;
