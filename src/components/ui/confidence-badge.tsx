import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function useCountUp(target: number, duration = 800, delay = 0) {
  const [value, setValue] = React.useState(0);
  const startTime = React.useRef<number | null>(null);
  const rafId = React.useRef<number>();

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }

    const timeout = window.setTimeout(() => {
      const animate = (timestamp: number) => {
        if (!startTime.current) startTime.current = timestamp;
        const elapsed = timestamp - startTime.current;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) rafId.current = requestAnimationFrame(animate);
      };

      rafId.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [target, duration, delay]);

  return value;
}

export interface ConfidenceBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { badge: "min-w-[72px] px-2.5 py-1.5", score: "text-base", label: "text-[10px]" },
  md: { badge: "min-w-[88px] px-3 py-2", score: "text-[28px]", label: "text-[11px]" },
  lg: { badge: "min-w-[104px] px-4 py-2.5", score: "text-[34px]", label: "text-xs" },
} as const;

export function ConfidenceBadge({
  score,
  size = "md",
  animate = true,
  showLabel = true,
  className,
}: ConfidenceBadgeProps) {
  const animatedScore = useCountUp(score);
  const displayScore = animate ? animatedScore : score;

  let styleConfig = "";
  let label = "";

  if (score >= 90) {
    styleConfig = "border-amber-200 bg-amber-50 text-amber-700 shadow-[0_0_8px_rgba(212,160,74,0.3)]";
    label = "Excellent match";
  } else if (score >= 75) {
    styleConfig = "border-indigo-200 bg-indigo-50 text-indigo-700";
    label = "Strong match";
  } else if (score >= 60) {
    styleConfig = "border-neutral-200 bg-neutral-100 text-neutral-700";
    label = "Good fit";
  } else {
    styleConfig = "border-neutral-200 bg-neutral-100 text-neutral-500";
    label = "Moderate match";
  }

  const badge = (
    <div
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-[1.25rem] border-[1.5px] text-center transition-colors",
        styleConfig,
        sizeMap[size].badge,
        className,
      )}
      role="status"
      aria-label={`${score} percent confidence — ${label}`}
    >
      <div className="flex items-baseline leading-none">
        <span className={cn("font-heading font-bold tracking-tight", sizeMap[size].score)}>{displayScore}</span>
        <span className="ml-[2px] text-[0.58em] font-body font-semibold">%</span>
      </div>
      {showLabel ? (
        <span className={cn("mt-1 font-body font-medium leading-tight opacity-85", sizeMap[size].label)}>{label}</span>
      ) : null}
    </div>
  );

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="hidden max-w-[220px] md:block">
          This score reflects how well the gift matches your recipient&apos;s interests,
          relationship depth, and occasion fit.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
