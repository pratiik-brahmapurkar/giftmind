import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Check, X } from "lucide-react";

interface SeoCardProps {
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
  title: string;
  content: string;
  featuredImageAlt: string;
  onFocusKeywordChange: (v: string) => void;
  onMetaTitleChange: (v: string) => void;
  onMetaDescriptionChange: (v: string) => void;
}

function CharBar({ value, greenMin, greenMax, yellowLow, yellowHigh }: { value: number; greenMin: number; greenMax: number; yellowLow: number; yellowHigh: number }) {
  const color = value >= greenMin && value <= greenMax ? "bg-green-500" : value >= yellowLow && value <= yellowHigh ? "bg-yellow-500" : "bg-destructive";
  const pct = Math.min((value / yellowHigh) * 100, 100);
  return (
    <div className="h-1.5 w-full bg-secondary rounded-full mt-1">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SeoCard(props: SeoCardProps) {
  const { focusKeyword, metaTitle, metaDescription, title, content, featuredImageAlt } = props;

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const first100 = content.trim().split(/\s+/).slice(0, 100).join(" ").toLowerCase();

  const checks = useMemo(() => {
    const kw = focusKeyword.toLowerCase().trim();
    return [
      { label: "Focus keyword appears in title", pass: kw ? title.toLowerCase().includes(kw) : false },
      { label: "Focus keyword in first 100 words", pass: kw ? first100.includes(kw) : false },
      { label: "Meta description is set", pass: metaDescription.trim().length > 0 },
      { label: "Featured image has alt text", pass: featuredImageAlt.trim().length > 0 },
      { label: "Post is 800+ words", pass: wordCount >= 800 },
      { label: "At least one H2 heading", pass: /^##\s/m.test(content) },
      { label: "At least one internal link", pass: /\]\(\/(gift-flow|blog|credits|my-people)/i.test(content) },
    ];
  }, [focusKeyword, title, first100, metaDescription, featuredImageAlt, wordCount, content]);

  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  const scoreColor = score >= 80 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-destructive";

  return (
    <Collapsible defaultOpen>
      <Card>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">SEO</CardTitle>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <div>
              <Label className="text-xs">Focus Keyword</Label>
              <Input value={focusKeyword} onChange={(e) => props.onFocusKeywordChange(e.target.value)} placeholder="e.g. diwali gifts" />
            </div>
            <div>
              <Label className="text-xs">Meta Title ({metaTitle.length} chars)</Label>
              <Input value={metaTitle} onChange={(e) => props.onMetaTitleChange(e.target.value)} />
              <CharBar value={metaTitle.length} greenMin={50} greenMax={60} yellowLow={40} yellowHigh={65} />
            </div>
            <div>
              <Label className="text-xs">Meta Description ({metaDescription.length} chars)</Label>
              <Textarea value={metaDescription} onChange={(e) => props.onMetaDescriptionChange(e.target.value)} rows={2} />
              <CharBar value={metaDescription.length} greenMin={150} greenMax={160} yellowLow={130} yellowHigh={170} />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <div className={`text-3xl font-bold ${scoreColor}`}>{score}</div>
              <p className="text-xs text-muted-foreground">SEO Score</p>
            </div>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-xs">
                  {c.pass ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-destructive" />}
                  <span className={c.pass ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
