import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/sentry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface AiDraftResult {
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  metaTitle: string;
  metaDescription: string;
}

interface AiDraftModalProps {
  open: boolean;
  initialTopic?: string;
  onClose: () => void;
  onInsert: (result: AiDraftResult) => void;
}

export default function AiDraftModal({ open, initialTopic, onClose, onInsert }: AiDraftModalProps) {
  const [topic, setTopic] = useState(initialTopic || "");
  const [tone, setTone] = useState<"informative" | "casual" | "listicle">("casual");
  const [targetLength, setTargetLength] = useState<800 | 1200 | 2000>(1200);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setTopic(initialTopic || "");
  }, [open, initialTopic]);

  const generateDraft = async () => {
    if (!topic.trim()) {
      toast.error("Topic is required");
      return;
    }

    setLoading(true);

    try {
      const response = await supabase.functions.invoke("blog-ai-assistant", {
        body: {
          action: "generate_draft",
          topic: topic.trim(),
          tone,
          target_word_count: targetLength,
        },
      });

      if (response.error) throw response.error;

      const result = response.data?.result;
      if (!result) throw new Error("The AI response was empty");

      onInsert({
        title: result.title,
        excerpt: result.excerpt,
        content: result.content,
        tags: result.suggested_tags || [],
        metaTitle: result.meta_title,
        metaDescription: result.meta_description,
      });

      toast.success("Draft generated. Review and edit before publishing.");
      onClose();
    } catch (error) {
      captureError(
        error instanceof Error ? error : new Error("Failed to generate AI draft"),
        { action: "blog-ai-generate-draft", tone, target_length: targetLength },
      );
      toast.error(error instanceof Error ? error.message : "Failed to generate draft");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-xl rounded-[28px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate Blog Post with AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="blog-ai-topic">Topic / Title</Label>
            <Input
              id="blog-ai-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Best Diwali Gift Ideas for 2026"
            />
          </div>

          <div className="space-y-3">
            <Label>Tone</Label>
            <RadioGroup
              value={tone}
              onValueChange={(value) => setTone(value as "informative" | "casual" | "listicle")}
              className="grid gap-3 sm:grid-cols-3"
            >
              {[
                { value: "informative", label: "Informative" },
                { value: "casual", label: "Casual" },
                { value: "listicle", label: "Listicle" },
              ].map((item) => (
                <label
                  key={item.value}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-3"
                >
                  <RadioGroupItem value={item.value} id={`tone-${item.value}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label>Target Length</Label>
            <RadioGroup
              value={String(targetLength)}
              onValueChange={(value) => setTargetLength(Number(value) as 800 | 1200 | 2000)}
              className="grid gap-3"
            >
              {[
                { value: 800, label: "Short (~800 words)" },
                { value: 1200, label: "Medium (~1,200 words)" },
                { value: 2000, label: "Long (~2,000 words)" },
              ].map((item) => (
                <label
                  key={item.value}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-3"
                >
                  <RadioGroupItem value={String(item.value)} id={`length-${item.value}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={generateDraft} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Writing your post...
              </>
            ) : (
              "Generate Draft"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
