import { useState, useEffect, type ElementType, type FormEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { Check, ChevronsUpDown, Globe, Heart, Plus, StickyNote, Trash2, User, X, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/posthog";
import { sanitizeString, validateCountryCode, validateRelationship } from "@/lib/validation";
import { isCustomDateLabel, isValidImportantDate, recipientFormSchema } from "@/lib/recipientValidation";
import {
  AGE_RANGES,
  COUNTRY_OPTIONS,
  CULTURAL_CONTEXTS,
  DATE_LABEL_OPTIONS,
  DIETARY_OPTIONS,
  GENDER_OPTIONS,
  INTEREST_SUGGESTIONS,
  RELATIONSHIP_DEPTHS,
  RELATIONSHIP_TYPES,
  type ImportantDate,
  type RecipientFormData,
  defaultFormData,
} from "./constants";

interface RecipientFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: RecipientFormData) => void;
  onDelete?: () => void;
  mode?: "create" | "edit";
  initialData?: RecipientFormData;
  loading?: boolean;
  reminderNote?: string;
  reminderQuota?: {
    plan: "locked" | "pro";
    used: number;
    limit: number | null;
    remaining: number | null;
  };
  onUpgradeReminders?: () => void;
  stats?: {
    giftCount: number;
    sessionCount: number;
    lastGiftDate: string | null;
    addedAt: string | null;
  };
}

const FormSection = ({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) => (
  <div className="space-y-3 rounded-xl border border-border/50 bg-muted/40 p-4">
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary/70" strokeWidth={1.5} /> {title}
    </p>
    {children}
  </div>
);

function normalizeDateLabelInput(value: string) {
  return DATE_LABEL_OPTIONS.some((option) => option.value === value) || !value ? value : "Other";
}

const RecipientFormModal = ({
  open,
  onOpenChange,
  onSubmit,
  onDelete,
  mode = "create",
  initialData,
  loading,
  reminderNote,
  reminderQuota,
  onUpgradeReminders,
  stats,
}: RecipientFormModalProps) => {
  const [form, setForm] = useState<RecipientFormData>(defaultFormData);
  const [customInterest, setCustomInterest] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState("");
  const isEdit = mode === "edit";
  const noteCount = form.notes.length;
  const reminderLimitForRecipient = reminderQuota?.limit == null
    ? 5
    : Math.max(0, Math.min(5, reminderQuota.limit));

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
    const alreadySelected = form.interests.includes(tag);
    if (!alreadySelected && form.interests.length >= 10) return;

    const interests = alreadySelected
      ? form.interests.filter((entry) => entry !== tag)
      : [...form.interests, tag];
    update("interests", interests);
  };

  const addCustomInterest = () => {
    const trimmed = sanitizeString(customInterest, 50);
    if (!trimmed || form.interests.includes(trimmed) || form.interests.length >= 10) {
      setCustomInterest("");
      return;
    }

    update("interests", [...form.interests, trimmed]);
    setCustomInterest("");
  };

  const toggleDietary = (value: string) => {
    const existing = form.cultural_context_obj.dietary;
    const dietary = existing.includes(value)
      ? existing.filter((entry) => entry !== value)
      : [...existing, value];

    update("cultural_context_obj", {
      ...form.cultural_context_obj,
      dietary,
    });
  };

  const addDate = () => {
    if (form.important_dates.length >= reminderLimitForRecipient) return;

    update("important_dates", [
      ...form.important_dates,
      { label: "Birthday", date: "", recurring: true },
    ]);
  };

  const updateDate = (index: number, next: ImportantDate) => {
    const dates = [...form.important_dates];
    dates[index] = next;
    update("important_dates", dates);
  };

  const removeDate = (index: number) => {
    update("important_dates", form.important_dates.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const sanitized: RecipientFormData = {
      ...form,
      name: sanitizeString(form.name, 100),
      relationship_type: validateRelationship(form.relationship_type) ? form.relationship_type : "",
      interests: form.interests.map((entry) => sanitizeString(entry, 50)).filter(Boolean).slice(0, 10),
      cultural_context: "",
      cultural_context_obj: {
        category: sanitizeString(form.cultural_context_obj.category, 50),
        dietary: form.cultural_context_obj.dietary.map((entry) => sanitizeString(entry, 30)).filter(Boolean).slice(0, 6),
      },
      country: validateCountryCode(form.country) ? form.country.toUpperCase() : "",
      notes: sanitizeString(form.notes, 500),
      important_dates: form.important_dates
        .map((entry) => ({
          label: sanitizeString(entry.label, 50),
          date: sanitizeString(entry.date, 5),
          recurring: true,
        }))
        .filter((entry) => entry.label && entry.date),
    };

    if (!sanitized.name) {
      setError("Name is required");
      return;
    }

    if (!sanitized.relationship_type) {
      setError("Please select a valid relationship");
      return;
    }

    if (sanitized.important_dates.some((entry) => !isValidImportantDate(entry.date))) {
      setError("Important dates must use MM-DD format.");
      return;
    }

    const parsed = recipientFormSchema.safeParse(sanitized);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Please review the form fields.");
      return;
    }

    setError("");

    if (!isEdit) {
      trackEvent("recipient_added", { relationship: parsed.data.relationship_type });
    }

    onSubmit(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border/50 bg-background px-6 pb-3 pt-5">
          <DialogTitle className="font-heading text-lg">
            {isEdit ? `Edit ${initialData?.name || "Person"} ✨` : "Add a Person ✨"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            The more you share, the better the gift recommendations.
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-80px)] px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-6 pr-2">
            {error && <p className="pt-4 text-sm text-destructive">{error}</p>}

            {stats && isEdit && (
              <div className="grid gap-3 pt-4 md:grid-cols-4">
                <div className="rounded-xl border border-border/50 bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{stats.sessionCount}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gifts</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{stats.giftCount}</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last Gift</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {stats.lastGiftDate ? format(new Date(stats.lastGiftDate), "MMM yyyy") : "None yet"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Added</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {stats.addedAt ? format(new Date(stats.addedAt), "MMM d, yyyy") : "Recently"}
                  </p>
                </div>
              </div>
            )}

            <FormSection icon={User} title="Basic Info">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="e.g. Mom, Priya, Alex"
                  maxLength={100}
                  required
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Relationship *</Label>
                <Select value={form.relationship_type} onValueChange={(value) => update("relationship_type", value)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((relationship) => (
                      <SelectItem key={relationship.value} value={relationship.value}>
                        <span className="mr-2">{relationship.emoji}</span> {relationship.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">How close are you?</Label>
                <RadioGroup
                  value={form.relationship_depth}
                  onValueChange={(value) => update("relationship_depth", value)}
                  className="flex flex-wrap gap-2"
                >
                  {RELATIONSHIP_DEPTHS.map((depth) => (
                    <label
                      key={depth.value}
                      htmlFor={`depth-${depth.value}`}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-all",
                        form.relationship_depth === depth.value
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      <RadioGroupItem value={depth.value} id={`depth-${depth.value}`} className="sr-only" />
                      {depth.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Age Range</Label>
                  <Select value={form.age_range} onValueChange={(value) => update("age_range", value)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Age" /></SelectTrigger>
                    <SelectContent>
                      {AGE_RANGES.map((range) => (
                        <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gender</Label>
                  <Select value={form.gender} onValueChange={(value) => update("gender", value)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Gender" /></SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((gender) => (
                        <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSection>

            <FormSection icon={Heart} title={`Interests${form.interests.length > 0 ? ` (${form.interests.length})` : ""}`}>
              <div className="flex flex-wrap gap-1.5">
                {INTEREST_SUGGESTIONS.map((tag) => {
                  const selected = form.interests.includes(tag);
                  return (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={cn(
                        "cursor-pointer px-2.5 py-1 text-xs transition-all duration-150",
                        selected
                          ? "scale-[1.02] border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                      onClick={() => toggleInterest(tag)}
                    >
                      {tag}
                    </Badge>
                  );
                })}
                {form.interests
                  .filter((entry) => !INTEREST_SUGGESTIONS.includes(entry))
                  .map((tag) => (
                    <Badge
                      key={tag}
                      className="cursor-pointer border-primary bg-primary px-2.5 py-1 text-xs text-primary-foreground"
                      onClick={() => toggleInterest(tag)}
                    >
                      {tag} <X className="ml-1 h-3 w-3" />
                    </Badge>
                  ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={form.interests.length >= 10 ? "Interest limit reached" : "Add custom interest"}
                  value={customInterest}
                  onChange={(event) => setCustomInterest(event.target.value)}
                  maxLength={50}
                  disabled={form.interests.length >= 10}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomInterest();
                    }
                  }}
                  className="h-9 text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={addCustomInterest} className="h-9 shrink-0 px-3">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Up to 10 interests per person.</p>
            </FormSection>

            <FormSection icon={Globe} title="Cultural Context">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cultural context</Label>
                  <Select
                    value={form.cultural_context_obj.category}
                    onValueChange={(value) =>
                      update("cultural_context_obj", { ...form.cultural_context_obj, category: value })
                    }
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select context" />
                    </SelectTrigger>
                    <SelectContent>
                      {CULTURAL_CONTEXTS.map((context) => (
                        <SelectItem key={context.value} value={context.value}>{context.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Dietary preferences</Label>
                  <p className="text-xs text-muted-foreground">Helps the AI avoid unsuitable gifts.</p>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((option) => {
                      const checked = form.cultural_context_obj.dietary.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
                            checked
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40",
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleDietary(option.value)} />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs">Where do they live?</Label>
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={countryOpen}
                        className="w-full justify-between font-normal"
                      >
                        {form.country
                          ? `${COUNTRY_OPTIONS.find((country) => country.value === form.country)?.flag || ""} ${COUNTRY_OPTIONS.find((country) => country.value === form.country)?.label || form.country}`
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
                              value="same-country"
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
                </div>
              </div>
            </FormSection>

            <FormSection icon={CalendarDays} title="Important Dates">
              {reminderQuota?.plan === "locked" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Dates saved. Reminders require Confident 🎯</p>
                  <p className="mt-1 text-xs text-amber-800">
                    You&apos;ll get email alerts 14, 3, and 1 day before each saved date.
                  </p>
                  {onUpgradeReminders ? (
                    <Button type="button" size="sm" variant="outline" className="mt-3 border-amber-300 bg-white" onClick={onUpgradeReminders}>
                      Unlock reminders →
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {reminderQuota?.plan === "pro" && reminderQuota.limit !== null ? (
                <div className="rounded-xl border border-border/60 bg-background p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {reminderQuota.used} upcoming reminder{reminderQuota.used === 1 ? "" : "s"} saved
                    {" · "}
                    {reminderQuota.remaining ?? 0} remaining
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Spark includes up to {reminderQuota.limit} reminder slots. Join the Pro waitlist for unlimited reminders.
                  </p>
                </div>
              ) : null}

              {reminderQuota?.plan === "pro" && reminderQuota.limit === null ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-medium">
                    {reminderQuota.used} upcoming reminder{reminderQuota.used === 1 ? "" : "s"} saved · Unlimited plan
                  </p>
                </div>
              ) : null}

              {form.important_dates.map((date, index) => {
                const labelValue = normalizeDateLabelInput(date.label);
                return (
                  <div key={`${date.label}-${index}`} className="space-y-2 rounded-lg border border-border bg-background p-3">
                    <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
                      <Select
                        value={labelValue || "Birthday"}
                        onValueChange={(value) =>
                          updateDate(index, {
                            ...date,
                            label: value === "Other" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose label" />
                        </SelectTrigger>
                        <SelectContent>
                          {DATE_LABEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.emoji} {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="04-25"
                        value={date.date}
                        onChange={(event) => updateDate(index, { ...date, date: event.target.value })}
                        maxLength={5}
                        className={cn("h-9 text-sm", date.date && !isValidImportantDate(date.date) && "border-destructive")}
                      />
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeDate(index)} aria-label="Remove date">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {(labelValue === "Other" || isCustomDateLabel(date.label)) && (
                      <Input
                        placeholder="Custom label"
                        value={date.label}
                        onChange={(event) => updateDate(index, { ...date, label: event.target.value })}
                        maxLength={50}
                        className="h-9 text-sm"
                      />
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDate}
                className="h-8 text-xs"
                disabled={form.important_dates.length >= reminderLimitForRecipient}
              >
                <Plus className="mr-1 h-3 w-3" /> Add Date
              </Button>
              <p className="text-xs text-muted-foreground">
                Use `MM-DD` format (Month-Day, e.g. 04-25). All saved dates repeat yearly automatically.
              </p>
              {reminderNote && <p className="text-xs text-muted-foreground">{reminderNote}</p>}
            </FormSection>

            <FormSection icon={StickyNote} title="Notes">
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Anything else that might help… e.g. 'loves anything with cats' or 'minimalist style'"
                maxLength={500}
                rows={4}
                className="text-sm"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Useful for style, hobbies, restrictions, or reminders.</span>
                <span>{noteCount}/500</span>
              </div>
            </FormSection>

            <div className="space-y-3 pb-2 pt-1">
              <Button type="submit" variant="hero" className="h-12 w-full text-base font-semibold" disabled={loading}>
                {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Person"}
              </Button>
              {isEdit && onDelete && (
                <Button type="button" variant="ghost" className="w-full text-destructive" onClick={onDelete}>
                  Delete {initialData?.name || "Person"}
                </Button>
              )}
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default RecipientFormModal;
