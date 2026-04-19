import React from 'react';
import { Button } from '@/components/ui/button';

interface SkipButtonProps {
  onClick: () => void;
}

export function SkipButton({ onClick }: SkipButtonProps) {
  return (
    <div className="absolute top-4 right-4 z-10">
      <Button variant="ghost" size="sm" onClick={onClick} className="text-muted-foreground hover:text-foreground">
        Skip
      </Button>
    </div>
  );
}
