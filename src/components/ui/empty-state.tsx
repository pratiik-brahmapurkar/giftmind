import { ReactNode } from "react";
import { Button } from "./button";

export const HastaHandIcon = ({ className }: { className?: string }) => (
  <svg 
    width="48" height="48" viewBox="0 0 48 48" fill="none"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
    className={className}
  >
    <path 
      d="M12 28 C12 36 36 36 36 28 L36 20 Q36 16 32 16 L32 12 Q32 8 28 8 Q24 8 24 12 L24 10 Q24 6 20 6 Q16 6 16 10 L16 12 Q12 12 12 16 Z"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

interface EmptyStateProps {
  title: string;
  description: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-amber-500 mb-6">
        {icon || <HastaHandIcon />}
      </div>
      <div className="space-y-3 mb-8">
        <h3 className="font-heading text-[18px] font-semibold text-neutral-800">{title}</h3>
        <p className="font-body text-[14px] text-neutral-500 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary" className="shadow-sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
