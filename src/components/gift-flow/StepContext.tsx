import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CONTEXT_TAGS } from "./constants";

interface StepContextProps {
  tags: string[];
  onToggleTag: (tag: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
}

const StepContext = ({ tags, onToggleTag, notes, onNotesChange }: StepContextProps) => {
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

      {/* Quick tags */}
      <div className="flex flex-wrap gap-2">
        {CONTEXT_TAGS.map((tag) => (
          <Badge
            key={tag}
            variant={tags.includes(tag) ? "default" : "outline"}
            className="cursor-pointer text-xs px-3 py-1.5"
            onClick={() => onToggleTag(tag)}
          >
            {tag}
          </Badge>
        ))}
      </div>

      {/* Textarea */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Tell us anything else that might help…
        </label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="e.g. She recently started painting, loves pastel colors, dislikes anything too techy…"
          rows={4}
          maxLength={1000}
        />
      </div>
    </div>
  );
};

export default StepContext;
