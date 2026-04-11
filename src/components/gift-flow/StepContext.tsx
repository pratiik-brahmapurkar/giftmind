import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CONTEXT_TAGS } from "@/lib/geoConfig";
import { cn } from "@/lib/utils";

interface StepContextProps {
  specialContext: string;
  onSpecialContextChange: (text: string) => void;
  contextTags: string[];
  onContextTagsChange: (tags: string[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function StepContext({
  specialContext,
  onSpecialContextChange,
  contextTags,
  onContextTagsChange,
  onContinue,
  onSkip,
  onBack,
}: StepContextProps) {
  const toggleTag = (id: string) => {
    if (contextTags.includes(id)) {
      onContextTagsChange(contextTags.filter((tag) => tag !== id));
      return;
    }
    onContextTagsChange([...contextTags, id]);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Anything else we should know?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Context is optional, but it helps the AI avoid generic ideas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CONTEXT_TAGS.map((tag) => {
          const isSelected = contextTags.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/30",
              )}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.emoji} {tag.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <Textarea
          value={specialContext}
          onChange={(event) => onSpecialContextChange(event.target.value.slice(0, 300))}
          placeholder="Examples: they already own most gadgets, it needs to ship fast, I want this to feel personal but not romantic."
          className="min-h-[140px]"
        />
        <p className="text-right text-xs text-muted-foreground">{specialContext.length}/300</p>
      </div>

      <div className="flex flex-col gap-3">
        <Button type="button" variant="outline" className="min-h-12" onClick={onSkip}>
          Skip and get recommendations
        </Button>
        <Button type="button" variant="hero" size="lg" className="min-h-12" onClick={onContinue}>
          Continue with context
        </Button>
        <Button type="button" variant="ghost" className="min-h-12" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}
