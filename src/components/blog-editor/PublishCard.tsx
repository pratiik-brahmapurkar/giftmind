import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, Save, Send, Clock } from "lucide-react";

interface PublishCardProps {
  status: string;
  scheduledAt: string;
  lastSaved: Date | null;
  saving: boolean;
  slug: string;
  onStatusChange: (v: "draft" | "published" | "scheduled" | "archived") => void;
  onScheduledAtChange: (v: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}

export default function PublishCard(props: PublishCardProps) {
  const { status, scheduledAt, lastSaved, saving, slug, onStatusChange, onScheduledAtChange, onSaveDraft, onPublish } = props;

  const timeSince = lastSaved
    ? `Auto-saved ${Math.round((Date.now() - lastSaved.getTime()) / 60000)} min ago`
    : "Not saved yet";

  return (
    <Card className="sticky top-4">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Publish</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => onStatusChange(v as "draft" | "published" | "scheduled" | "archived")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {status === "scheduled" && (
          <div>
            <Label className="text-xs">Schedule Date & Time</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => onScheduledAtChange(e.target.value)} />
          </div>
        )}
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" /> {saving ? "Saving..." : timeSince}
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={onSaveDraft} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Button size="sm" onClick={onPublish} disabled={saving}>
            <Send className="h-4 w-4 mr-1" /> {status === "scheduled" ? "Schedule" : "Publish Now"}
          </Button>
          {slug && (
            <Button variant="ghost" size="sm" asChild>
              <a href={`/blog/${slug}?preview=true`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-1" /> Preview
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
