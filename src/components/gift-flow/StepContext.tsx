import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CONTEXT_TAGS } from "./constants";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface StepContextProps {
  tags: string[];
  onToggleTag: (tag: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  onSkip?: () => void;
}

const StepContext = ({ tags, onToggleTag, notes, onNotesChange, onSkip }: StepContextProps) => {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Any special context?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          This is optional but helps us find better matches
        </p>
      </div>

      {/* Quick tags with emoji */}
      <div className="flex flex-wrap gap-2">
        {CONTEXT_TAGS.map((tag) => {
          const isSelected = tags.includes(tag.label);
          return (
            <button
              key={tag.label}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/40"
              )}
              onClick={() => onToggleTag(tag.label)}
            >
              {tag.emoji} {tag.label}
            </button>
          );
        })}
      </div>

      {/* Textarea */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Anything else that might help? (optional)
        </label>
        <div className="relative">
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value.slice(0, 300))}
            placeholder="e.g., She just started painting, he's really into cricket, they're vegan..."
            rows={3}
            maxLength={300}
          />
          <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
            {notes.length}/300
          </span>
        </div>
      </div>

      {onSkip && (
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground text-xs">
          Skip this step <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
};

export default StepContext;
