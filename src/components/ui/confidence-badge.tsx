import * as React from "react";
import { cn } from "@/lib/utils";

export function useCountUp(target: number, duration = 800, delay = 0) {
  const [value, setValue] = React.useState(0);
  const startTime = React.useRef<number | null>(null);
  const rafId = React.useRef<number>();

  React.useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setValue(target); return; }

    const timeout = setTimeout(() => {
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
      clearTimeout(timeout);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [target, duration, delay]);

  return value;
}

export interface ConfidenceBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { badge: 'px-2 py-1', score: 'text-sm' },
  md: { badge: 'px-3 py-1.5 min-w-[64px]', score: 'text-lg' },
  lg: { badge: 'px-4 py-2 min-w-[80px]', score: 'text-2xl' },
};

export function ConfidenceBadge({ 
  score, 
  size = 'md', 
  animate = true, 
  showLabel = true,
  className 
}: ConfidenceBadgeProps) {
  const displayScore = animate ? useCountUp(score) : score;

  let styleConfig = "";
  let label = "";

  if (score >= 90) {
    styleConfig = "bg-amber-50 text-amber-700 border-amber-200 shadow-[0_0_8px_rgba(212,160,74,0.3)]";
    label = "Excellent match";
  } else if (score >= 75) {
    styleConfig = "bg-indigo-50 text-indigo-700 border-indigo-200";
    label = "Strong match";
  } else if (score >= 60) {
    styleConfig = "bg-neutral-100 text-neutral-600 border-neutral-200";
    label = "Good match";
  } else {
    styleConfig = "bg-neutral-100 text-neutral-400 border-neutral-200";
    label = "Moderate match";
  }

  return (
    <div 
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-full border text-center font-heading transition-colors",
        styleConfig,
        sizeMap[size].badge,
        className
      )}
      role="status"
      aria-label={`${score}% confidence score`}
    >
      <div className="flex items-baseline leading-none">
        <span className={cn("font-bold tracking-tight", sizeMap[size].score)}>
          {displayScore}
        </span>
        <span className="text-[0.65em] font-body font-semibold ml-[1px]">%</span>
      </div>
      {showLabel && (
        <span className="font-body text-[10px] mt-0.5 uppercase tracking-wider opacity-80 font-medium">
          {label.split(" ")[0]}
        </span>
      )}
    </div>
  );
}
