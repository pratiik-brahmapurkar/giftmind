import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  onClose: () => void;
  onInsert: (result: AiDraftResult) => void;
}

export default function AiDraftModal({ open, onClose, onInsert }: AiDraftModalProps) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("informative");
  const [length, setLength] = useState("1200");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiDraftResult | null>(null);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-blog-draft", {
        body: { topic, tone, wordCount: parseInt(length) },
      });
      if (error) throw error;
      setResult(data as AiDraftResult);
    } catch (e: any) {
      toast.error("Failed to generate draft: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI Draft Generator</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <div>
              <Label>Topic / Keyword *</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Diwali gift ideas for colleagues" />
            </div>
            <div>
              <Label>Tone</Label>
              <RadioGroup value={tone} onValueChange={setTone} className="flex gap-4 mt-1">
                {["informative", "casual", "listicle"].map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <RadioGroupItem value={t} id={`tone-${t}`} />
                    <Label htmlFor={`tone-${t}`} className="capitalize cursor-pointer">{t}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label>Length (words)</Label>
              <RadioGroup value={length} onValueChange={setLength} className="flex gap-4 mt-1">
                {["800", "1200", "2000"].map((l) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <RadioGroupItem value={l} id={`len-${l}`} />
                    <Label htmlFor={`len-${l}`} className="cursor-pointer">{l}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <p className="text-xs text-muted-foreground">AI generation uses Lovable AI — no credits deducted.</p>
            <Button onClick={generate} disabled={loading || !topic.trim()} className="w-full">
              {loading ? <><Loader2 className="animate-spin mr-2 h-4 w-4" /> Generating...</> : "Generate"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-muted-foreground">Title</Label>
              <p className="font-semibold">{result.title}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Excerpt</Label>
              <p className="text-sm">{result.excerpt}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Content preview</Label>
              <p className="text-sm text-muted-foreground line-clamp-4">{result.content.slice(0, 300)}...</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Tags</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {result.tags.map((t) => (
                  <span key={t} className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs">{t}</span>
                ))}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setResult(null); generate(); }}>Regenerate</Button>
              <Button onClick={() => { onInsert(result); onClose(); }}>Insert into Editor</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
