import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, CalendarDays } from "lucide-react";
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_DEPTHS,
  AGE_RANGES,
  GENDER_OPTIONS,
  CULTURAL_CONTEXTS,
  INTEREST_SUGGESTIONS,
  type RecipientFormData,
  type ImportantDate,
  defaultFormData,
} from "./constants";

interface RecipientFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: RecipientFormData) => void;
  initialData?: RecipientFormData;
  loading?: boolean;
}

const RecipientFormModal = ({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  loading,
}: RecipientFormModalProps) => {
  const [form, setForm] = useState<RecipientFormData>(defaultFormData);
  const [customInterest, setCustomInterest] = useState("");
  const isEdit = !!initialData;

  useEffect(() => {
    if (open) {
      setForm(initialData || defaultFormData);
      setCustomInterest("");
    }
  }, [open, initialData]);

  const update = <K extends keyof RecipientFormData>(key: K, value: RecipientFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleInterest = (tag: string) => {
    const interests = form.interests.includes(tag)
      ? form.interests.filter((i) => i !== tag)
      : [...form.interests, tag];
    update("interests", interests);
  };

  const addCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (trimmed && !form.interests.includes(trimmed)) {
      update("interests", [...form.interests, trimmed]);
    }
    setCustomInterest("");
  };

  const addDate = () => {
    update("important_dates", [
      ...form.important_dates,
      { label: "", date: "", recurring: true },
    ]);
  };

  const updateDate = (index: number, field: keyof ImportantDate, value: any) => {
    const dates = [...form.important_dates];
    dates[index] = { ...dates[index], [field]: value };
    update("important_dates", dates);
  };

  const removeDate = (index: number) => {
    update("important_dates", form.important_dates.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.relationship_type) return;
    onSubmit({
      ...form,
      name: form.name.trim().slice(0, 100),
      notes: form.notes.slice(0, 1000),
      important_dates: form.important_dates.filter((d) => d.label && d.date),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading">
            {isEdit ? "Edit Person" : "Add a Person"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="px-6 pb-6 max-h-[calc(90vh-80px)]">
          <form onSubmit={handleSubmit} className="space-y-5 pr-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Mom, Priya, Alex"
                maxLength={100}
                required
              />
            </div>

            {/* Relationship Type */}
            <div className="space-y-1.5">
              <Label>Relationship *</Label>
              <Select value={form.relationship_type} onValueChange={(v) => update("relationship_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Relationship Depth */}
            <div className="space-y-1.5">
              <Label>How close are you?</Label>
              <RadioGroup
                value={form.relationship_depth}
                onValueChange={(v) => update("relationship_depth", v)}
                className="flex gap-3"
              >
                {RELATIONSHIP_DEPTHS.map((d) => (
                  <div key={d.value} className="flex items-center gap-1.5">
                    <RadioGroupItem value={d.value} id={`depth-${d.value}`} />
                    <Label htmlFor={`depth-${d.value}`} className="text-sm font-normal cursor-pointer">
                      {d.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Age Range */}
            <div className="space-y-1.5">
              <Label>Age Range</Label>
              <Select value={form.age_range} onValueChange={(v) => update("age_range", v)}>
                <SelectTrigger><SelectValue placeholder="Select age range" /></SelectTrigger>
                <SelectContent>
                  {AGE_RANGES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Gender */}
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Interests */}
            <div className="space-y-1.5">
              <Label>Interests</Label>
              <div className="flex flex-wrap gap-1.5">
                {INTEREST_SUGGESTIONS.map((tag) => (
                  <Badge
                    key={tag}
                    variant={form.interests.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleInterest(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
                {form.interests
                  .filter((i) => !INTEREST_SUGGESTIONS.includes(i))
                  .map((tag) => (
                    <Badge key={tag} variant="default" className="cursor-pointer text-xs" onClick={() => toggleInterest(tag)}>
                      {tag} <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Add custom interest"
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  maxLength={50}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomInterest();
                    }
                  }}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustomInterest} className="h-8 shrink-0">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Cultural Context */}
            <div className="space-y-1.5">
              <Label>Cultural Context</Label>
              <Select value={form.cultural_context} onValueChange={(v) => update("cultural_context", v)}>
                <SelectTrigger><SelectValue placeholder="Select context" /></SelectTrigger>
                <SelectContent>
                  {CULTURAL_CONTEXTS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Important Dates */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" /> Important Dates
              </Label>
              {form.important_dates.map((d, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <Input
                    placeholder="Label (e.g. Birthday)"
                    value={d.label}
                    onChange={(e) => updateDate(i, "label", e.target.value)}
                    maxLength={50}
                    className="h-8 text-sm flex-1"
                  />
                  <Input
                    placeholder="MM-DD"
                    value={d.date}
                    onChange={(e) => updateDate(i, "date", e.target.value)}
                    maxLength={5}
                    className="h-8 text-sm w-20"
                  />
                  <div className="flex items-center gap-1">
                    <Checkbox
                      checked={d.recurring}
                      onCheckedChange={(v) => updateDate(i, "recurring", !!v)}
                      id={`recurring-${i}`}
                    />
                    <Label htmlFor={`recurring-${i}`} className="text-[10px] text-muted-foreground cursor-pointer">
                      Yearly
                    </Label>
                  </div>
                  <button type="button" onClick={() => removeDate(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDate} className="h-8 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Date
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Anything else that might help…"
                maxLength={1000}
                rows={3}
              />
            </div>

            <Button type="submit" variant="hero" className="w-full" disabled={loading}>
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Person"}
            </Button>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default RecipientFormModal;
