import React from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ProfileCompletionBannerProps {
  completionPct: number;
  missingFields: string[];
  onFinishSetup?: () => void;
  onDismiss: () => void;
}

export function ProfileCompletionBanner({ completionPct, missingFields, onFinishSetup, onDismiss }: ProfileCompletionBannerProps) {
  const navigate = useNavigate();
  
  const handleFinishSetup = () => {
    if (onFinishSetup) {
      onFinishSetup();
    } else {
      navigate('/onboarding?resume=true');
    }
  };

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 relative mb-8">
      <button onClick={onDismiss} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
      
      <div className="flex-1 w-full space-y-2">
        <h3 className="font-medium flex items-center pr-6">
          <span className="mr-2">📋</span> Complete your profile to get better gift ideas
        </h3>
        
        <div className="flex items-center gap-3 w-full max-w-sm">
          <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out" 
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold">{completionPct}%</span>
        </div>
        
        {missingFields.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Missing: {missingFields.join(' · ')}
          </p>
        )}
      </div>

      <Button onClick={handleFinishSetup} className="w-full sm:w-auto mt-2 sm:mt-0 shrink-0">
        Finish Setup <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
