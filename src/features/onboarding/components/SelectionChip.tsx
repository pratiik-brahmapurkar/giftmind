import React from 'react';
import { cn } from '@/lib/utils';

interface SelectionChipProps {
  label: string;
  emoji?: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}

export function SelectionChip({ label, emoji, selected, onClick, className }: SelectionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl border-2 transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground rounded-xl",
        className
      )}
    >
      {emoji && <span className="text-xl sm:text-2xl mb-1 sm:mb-2">{emoji}</span>}
      <span className="font-medium text-xs sm:text-sm">{label}</span>
    </button>
  );
}
