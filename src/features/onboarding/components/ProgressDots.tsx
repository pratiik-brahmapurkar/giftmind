import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressDotsProps {
  total: number;
  current: number;
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div className="flex items-center justify-center space-x-2 w-full py-4">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={cn(
              "rounded-full transition-all duration-300",
              current === i + 1 ? "w-6 h-2 bg-primary" : "w-2 h-2 bg-primary/20"
            )}
          />
          {i < total - 1 && (
            <div className="w-4 h-[1px] bg-primary/10" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
