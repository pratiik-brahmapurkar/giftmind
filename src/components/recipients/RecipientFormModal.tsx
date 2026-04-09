import { useState, useEffect, type ElementType, type FormEvent, type ReactNode } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, CalendarDays, Check, ChevronsUpDown, User, Heart, Globe, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/posthog";
import { sanitizeArray, sanitizeString, validateCountryCode, validateRelationship } from "@/lib/validation";
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_DEPTHS,
  AGE_RANGES,
  GENDER_OPTIONS,
  CULTURAL_CONTEXTS,
  INTEREST_SUGGESTIONS,
  COUNTRY_OPTIONS,
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
  reminderNote?: string;
}

/* ── Reusable section wrapper ── */
const FormSection = ({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) => (
  <div className="rounded-xl bg-muted/40 border border-border/50 p-4 space-y-3">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-primary/70" /> {title}
    </p>
    {children}
  </div>
);

const RecipientFormModal = ({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  loading,
  reminderNote,
}: RecipientFormModalProps) => {
  const [form, setForm] = useState<RecipientFormData>(defaultFormData);
  const [customInterest, setCustomInterest] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!initialData;

  useEffect(() => {
    if (open) {
      setForm(initialData || defaultFormData);
      setCustomInterest("");
      setError("");
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanData: RecipientFormData = {
      ...form,
      name: sanitizeString(form.name, 100),
      relationship_type: validateRelationship(form.relationship_type) ? form.relationship_type : "",
      interests: sanitizeArray(form.interests, 15),
      notes: sanitizeString(form.notes, 500),
      cultural_context: sanitizeString(form.cultural_context, 50),
      country: validateCountryCode(form.country) ? form.country.toUpperCase() : "",
      important_dates: form.important_dates
        .map((date) => ({
          label: sanitizeString(date.label, 50),
          date: sanitizeString(date.date, 5),
          recurring: !!date.recurring,
        }))
        .filter((date) => date.label && date.date),
    };

    if (!cleanData.name || cleanData.name.length < 1) {
      setError("Name is required");
      return;
    }

    if (!cleanData.relationship_type) {
      setError("Please select a valid relationship");
      return;
    }

    setError("");

    if (!isEdit) {
      trackEvent('recipient_added', { relationship: cleanData.relationship_type });
    }

    onSubmit(cleanData);
  };

  const selectedCount = form.interests.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] p-0 gap-0 overflow-hidden">
        {/* ── Sticky header ── */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/50 bg-background sticky top-0 z-10">
          <DialogTitle className="font-heading text-lg">
            {isEdit ? "Edit Person" : "Add a Person"} ✨
          </DialogTitle>
          <p className="text-xs text-muted-foreground -mt-0.5">
            The more you share, the better the gift recommendations.
          </p>
        </DialogHeader>

        <ScrollArea className="px-6 pb-6 max-h-[calc(90vh-80px)]">
          <form onSubmit={handleSubmit} className="space-y-6 pr-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* ── Section 1: Basic Info ── */}
            <FormSection icon={User} title="Basic Info">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Mom, Priya, Alex"
                  maxLength={100}
                  required
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Relationship *</Label>
                <Select value={form.relationship_type} onValueChange={(v) => update("relationship_type", v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className="mr-2">{r.emoji}</span> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">How close are you?</Label>
                <RadioGroup
                  value={form.relationship_depth}
                  onValueChange={(v) => update("relationship_depth", v)}
                  className="flex gap-2"
                >
                  {RELATIONSHIP_DEPTHS.map((d) => (
                    <label
                      key={d.value}
                      htmlFor={`depth-${d.value}`}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-all ${
                        form.relationship_depth === d.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <RadioGroupItem value={d.value} id={`depth-${d.value}`} className="sr-only" />
                      {d.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Age Range</Label>
                  <Select value={form.age_range} onValueChange={(v) => update("age_range", v)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Age" /></SelectTrigger>
                    <SelectContent>
                      {AGE_RANGES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => update("gender", v)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Gender" /></SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSection>

            {/* ── Section 2: Interests ── */}
            <FormSection icon={Heart} title={`Interests${selectedCount > 0 ? ` (${selectedCount})` : ""}`}>
              <div className="flex flex-wrap gap-1.5">
                {INTEREST_SUGGESTIONS.map((tag) => {
                  const selected = form.interests.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={`cursor-pointer text-xs px-2.5 py-1 transition-all duration-150 ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary shadow-sm scale-[1.02]"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                      onClick={() => toggleInterest(tag)}
                    >
                      {tag}
                    </Badge>
                  );
                })}
                {form.interests
                  .filter((i) => !INTEREST_SUGGESTIONS.includes(i))
                  .map((tag) => (
                    <Badge
                      key={tag}
                      className="cursor-pointer text-xs px-2.5 py-1 bg-primary text-primary-foreground border-primary"
                      onClick={() => toggleInterest(tag)}
                    >
                      {tag} <X className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom interest"
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  maxLength={50}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addCustomInterest(); }
                  }}
                  className="h-9 text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustomInterest} className="h-9 px-3 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </FormSection>

            {/* ── Section 3: Cultural Context & Country ── */}
            <FormSection icon={Globe} title="Cultural Context">
              <div className="space-y-3">
                <Select value={form.cultural_context} onValueChange={(v) => update("cultural_context", v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select context" />
                  </SelectTrigger>
                  <SelectContent>
                    {CULTURAL_CONTEXTS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Where do they live?</Label>
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryOpen}
                      className="w-full justify-between font-normal"
                    >
                      {form.country
                        ? COUNTRY_OPTIONS.find((c) => c.value === form.country)?.flag + " " + COUNTRY_OPTIONS.find((c) => c.value === form.country)?.label
                        : "Same as my country"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search country..." />
                      <CommandList>
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="empty"
                            onSelect={() => {
                              update("country", "");
                              setCountryOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.country === "" ? "opacity-100" : "opacity-0")} />
                            Same as my country
                          </CommandItem>
                          {COUNTRY_OPTIONS.map((country) => (
                            <CommandItem
                              key={country.value}
                              value={country.label}
                              onSelect={() => {
                                update("country", country.value);
                                setCountryOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", form.country === country.value ? "opacity-100" : "opacity-0")} />
                              {country.flag} {country.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {form.country && form.country !== "" && (
                  <p className="text-xs text-muted-foreground">
                    Gift recommendations and store links will be tailored for {COUNTRY_OPTIONS.find((c) => c.value === form.country)?.label} {COUNTRY_OPTIONS.find((c) => c.value === form.country)?.flag}
                  </p>
                )}
              </div>
            </FormSection>

            {/* ── Section 4: Important Dates ── */}
            <FormSection icon={CalendarDays} title="Important Dates">
              {form.important_dates.map((d, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5">
                  <Input
                    placeholder="e.g. Birthday"
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
                  <button
                    type="button"
                    onClick={() => removeDate(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDate} className="h-8 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Date
              </Button>
              {reminderNote && (
                <p className="text-xs text-muted-foreground mt-1">{reminderNote}</p>
              )}
            </FormSection>

            {/* ── Section 5: Notes ── */}
            <FormSection icon={StickyNote} title="Notes">
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Anything else that might help… e.g. 'loves anything with cats' or 'minimalist style'"
                maxLength={1000}
                rows={3}
                className="text-sm"
              />
            </FormSection>

            {/* ── Submit ── */}
            <div className="pt-1 pb-2">
              <Button type="submit" variant="hero" className="w-full h-12 text-base font-semibold" disabled={loading}>
                {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Person"}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default RecipientFormModal;
