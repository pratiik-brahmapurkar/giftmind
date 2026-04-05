import { Progress } from "@/components/ui/progress";
import { STEP_LABELS } from "./constants";
import { cn } from "@/lib/utils";

interface StepperProps {
  currentStep: number;
}

const GiftFlowStepper = ({ currentStep }: StepperProps) => {
  const progress = ((currentStep + 1) / STEP_LABELS.length) * 100;

  return (
    <div className="space-y-3">
      <Progress value={progress} className="h-2" />
      <div className="flex justify-between">
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "text-[10px] md:text-xs font-medium transition-colors",
              i <= currentStep ? "text-primary" : "text-muted-foreground/50"
            )}
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GiftFlowStepper;
