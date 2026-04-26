import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Info, Lightbulb, Lock, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RELATIONSHIP_TYPES,
  INTEREST_SUGGESTIONS,
  type RecipientFormData,
  defaultFormData,
} from "@/components/recipients/constants";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { useUserPlan } from "@/hooks/useUserPlan";
import type { Recipient } from "@/hooks/useGiftSession";
import { RELATIONSHIP_COLORS } from "@/lib/geoConfig";
import { canAddRecipientForPlan, getRecipientLimit, getRecipientLimitMessage } from "@/lib/planLimits";
import {
  buildRecipientInsertPayload,
  createRecipientAuthError,
  createRecipientMutationError,
  type RecipientMutationError,
} from "@/lib/recipients";
import { cn } from "@/lib/utils";
import CrossBorderSelect from "./CrossBorderSelect";

interface StepRecipientProps {
  selectedRecipient: Recipient | null;
  onSelectRecipient: (recipient: Recipient) => void;
  recipientCountry: string | null;
  onRecipientCountryChange: (country: string | null) => void;
  isCrossBorder: boolean;
  onCrossBorderChange: (value: boolean) => void;
  onContinue: () => void;
  userPlan: string;
  isFirstTime?: boolean;
  isPreloaded?: boolean;
  prefillSource?: string | null;
}

interface RecipientRecord {
  id: string;
  name: string;
  relationship: string | null;
  relationship_depth: string | null;
  age_range: string | null;
  gender: string | null;
  interests: string[] | null;
  cultural_context: string | null;
  country: string | null;
  notes: string | null;
  last_gift_date: string | null;
  last_gift_name: string | null;
  gift_count_cached: number | null;
  created_at: string | null;
}

function toRecipient(record: RecipientRecord): Recipient {
  return {
    id: record.id,
    name: record.name,
    relationship: record.relationship ?? "",
    relationship_depth: record.relationship_depth ?? "",
    age_range: record.age_range ?? "",
    gender: record.gender ?? "",
    interests: record.interests ?? [],
    cultural_context: record.cultural_context ?? "",
    country: record.country,
    notes: record.notes ?? "",
  };
}

function formatLastGifted(dateStr: string | null) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);

    const formatted = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);

    return {
      text: formatted,
      isOverdue: diffMonths > 6,
    };
  } catch {
    return null;
  }
}

export default function StepRecipient({
  selectedRecipient,
  onSelectRecipient,
  recipientCountry,
  onRecipientCountryChange,
  isCrossBorder,
  onCrossBorderChange,
  onContinue,
  isFirstTime = false,
  isPreloaded = false,
  prefillSource = null,
}: StepRecipientProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const planLimits = useUserPlan();
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [showPrefilledBanner, setShowPrefilledBanner] = useState(isPreloaded);
  const [howItWorksDismissed, setHowItWorksDismissed] = useState(() => {
    try {
      return localStorage.getItem("gm_how_it_works_dismissed") === "true";
    } catch {
      return false;
    }
  });

  // Inline form state
  const [inlineForm, setInlineForm] = useState<Pick<RecipientFormData, "name" | "relationship_type" | "interests">>({
    name: "",
    relationship_type: "",
    interests: [],
  });
  const [customInterest, setCustomInterest] = useState("");

  // Auto-dismiss pre-filled banner
  useEffect(() => {
    if (!showPrefilledBanner) return;
    const timer = setTimeout(() => setShowPrefilledBanner(false), 5000);
    return () => clearTimeout(timer);
  }, [showPrefilledBanner]);

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["gift-flow-recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes, last_gift_date, last_gift_name, gift_count_cached, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as RecipientRecord[];
    },
    enabled: !!user,
  });

  const addRecipient = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to add a person");

      const [{ data: userData }, { count, error: countError }] = await Promise.all([
        supabase.from("users").select("active_plan").eq("id", authUser.id).single(),
        supabase.from("recipients").select("*", { count: "exact", head: true }).eq("user_id", authUser.id),
      ]);

      if (countError) throw countError;

      const activePlan = userData?.active_plan || "spark";
      const maxAllowed = getRecipientLimit(activePlan);
      if (!canAddRecipientForPlan(activePlan, count || 0)) {
        setUpgradeOpen(true);
        throw createRecipientAuthError(getRecipientLimitMessage(activePlan, maxAllowed));
      }

      const payload = buildRecipientInsertPayload(authUser.id, form);
      const { data, error } = await supabase
        .from("recipients")
        .insert(payload)
        .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes, last_gift_date, last_gift_name, gift_count_cached, created_at")
        .single();

      if (error) throw createRecipientMutationError("insert", error, payload);
      return data as RecipientRecord;
    },
    onSuccess: (data) => {
      const mapped = toRecipient(data);
      queryClient.invalidateQueries({ queryKey: ["gift-flow-recipients", user?.id] });
      onSelectRecipient(mapped);
      onRecipientCountryChange(mapped.country);
      onCrossBorderChange(Boolean(mapped.country));
      setShowInlineForm(false);
      setInlineForm({ name: "", relationship_type: "", interests: [] });
      toast.success("Recipient added");
    },
    onError: (error: RecipientMutationError) => {
      toast.error(error.userMessage || "Could not add recipient");
    },
  });

  const handleInlineSubmit = () => {
    if (!inlineForm.name.trim() || !inlineForm.relationship_type) {
      toast.error("Name and relationship are required");
      return;
    }
    if (atRecipientLimit) {
      setUpgradeOpen(true);
      return;
    }

    const formData: RecipientFormData = {
      ...defaultFormData,
      name: inlineForm.name.trim(),
      relationship_type: inlineForm.relationship_type,
      interests: inlineForm.interests,
    };

    addRecipient.mutate(formData);
  };

  const toggleInlineInterest = (tag: string) => {
    setInlineForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(tag)
        ? prev.interests.filter((i) => i !== tag)
        : [...prev.interests, tag],
    }));
  };

  const addCustomInlineInterest = () => {
    const trimmed = customInterest.trim();
    if (trimmed && !inlineForm.interests.includes(trimmed)) {
      setInlineForm((prev) => ({ ...prev, interests: [...prev.interests, trimmed] }));
    }
    setCustomInterest("");
  };

  const selectedCountry = useMemo(
    () => recipientCountry ?? selectedRecipient?.country ?? null,
    [recipientCountry, selectedRecipient?.country],
  );

  const dismissHowItWorks = () => {
    setHowItWorksDismissed(true);
    try {
      localStorage.setItem("gm_how_it_works_dismissed", "true");
    } catch { /* noop */ }
  };

  const maxAllowed = planLimits.maxRecipients;
  const sortedRecipients = useMemo(
    () => [...recipients].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()),
    [recipients],
  );
  const selectedRecipientRecord = useMemo(
    () => recipients.find((recipient) => recipient.id === selectedRecipient?.id) ?? null,
    [recipients, selectedRecipient?.id],
  );
  const prefillBannerText = useMemo(() => {
    if (prefillSource === "gift_again") return "Pre-filled from Gift History";
    if (prefillSource?.startsWith("reminder_")) return "Pre-filled from your reminder";
    if (prefillSource === "dashboard_upcoming") return "Pre-filled from Upcoming Occasions";
    return "Pre-filled from your People page";
  }, [prefillSource]);
  const activeRecipients = maxAllowed === -1 ? sortedRecipients : sortedRecipients.slice(0, maxAllowed);
  const lockedRecipients = maxAllowed === -1 ? [] : sortedRecipients.slice(maxAllowed);
  const activeRecipientIds = useMemo(() => new Set(activeRecipients.map((recipient) => recipient.id)), [activeRecipients]);
  const atRecipientLimit = maxAllowed !== -1 && recipients.length >= maxAllowed;
  const selectedRecipientIsActive = Boolean(selectedRecipient?.id && activeRecipientIds.has(selectedRecipient.id));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 1</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">Who is this for?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Pick someone you already know in GiftMind or add a new person.
        </p>
      </div>

      {/* Pre-filled banner (Item 6) */}
      <AnimatePresence>
        {showPrefilledBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 cursor-pointer"
            onClick={() => setShowPrefilledBanner(false)}
          >
            <Info className="h-4 w-4 shrink-0" />
            {prefillBannerText}
          </motion.div>
        )}
      </AnimatePresence>

      {/* How it works callout (Item 3) */}
      <AnimatePresence>
        {isFirstTime && !howItWorksDismissed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25 }}
          >
            <Card className="overflow-hidden rounded-3xl border-amber-200 bg-[#FBF6EC] shadow-sm">
              <CardContent className="relative p-5 md:p-6">
                <button
                  type="button"
                  onClick={dismissHowItWorks}
                  className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Dismiss how it works"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2 text-sm font-semibold text-[#5C4524]">
                  <Sparkles className="h-4 w-4 text-primary" />
                  How it works
                </div>

                <ol className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    "Pick who the gift is for",
                    "Tell us the occasion & budget",
                    "Get 3 AI-curated gift recommendations",
                  ].map((item, index) => (
                    <li key={item} className="rounded-2xl border border-amber-200 bg-white/70 p-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {index + 1}
                      </span>
                      <p className="mt-3 text-sm font-medium leading-snug text-foreground">{item}</p>
                    </li>
                  ))}
                </ol>

                <p className="mt-4 rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 text-sm text-[#6F5326]">
                  Each session uses 1 credit. Spark gives you <span className="font-semibold text-primary">3 free credits</span>!
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 md:grid-cols-2">
        {isLoading &&
          [1, 2, 3].map((item) => (
            <Card key={item} className="border-border/60">
              <CardContent className="space-y-4 p-5">
                <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}

        {!isLoading &&
          activeRecipients.map((record) => {
            const recipient = toRecipient(record);
            const isSelected = selectedRecipient?.id === recipient.id;
            const relationshipLabel =
              RELATIONSHIP_TYPES.find((item) => item.value === recipient.relationship)?.label ?? recipient.relationship;
            const lastGifted = formatLastGifted(record.last_gift_date);
            const priorGiftCount = record.gift_count_cached ?? 0;

            return (
              <Card
                key={recipient.id}
                className={cn(
                  "cursor-pointer border-2 transition-all duration-150 hover:shadow-md",
                  isSelected
                    ? "scale-[1.01] border-primary bg-primary/5 shadow-sm"
                    : "border-border/60 hover:border-primary/30",
                )}
                onClick={() => {
                  onSelectRecipient(recipient);
                  onRecipientCountryChange(recipient.country);
                  onCrossBorderChange(Boolean(recipient.country));
                }}
              >
                <CardContent className="relative space-y-4 p-5">
                  {isSelected && (
                    <div className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: RELATIONSHIP_COLORS[recipient.relationship] || "#7c3aed" }}
                    >
                      {recipient.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{recipient.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px]">
                          {relationshipLabel}
                        </Badge>
                        {/* Last gifted badge (Item 4) */}
                        {lastGifted ? (
                          lastGifted.isOverdue ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[11px] text-amber-700">
                              <Clock className="mr-1 h-3 w-3" />
                              Overdue
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              Last gifted: {lastGifted.text}
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">Never gifted</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {priorGiftCount > 0 && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">
                        🎁 Last gifted: {record.last_gift_name || "A previous GiftMind pick"}
                        {lastGifted ? ` (${lastGifted.text})` : ""}
                      </p>
                      <p className="mt-1">
                        {priorGiftCount} gift{priorGiftCount === 1 ? "" : "s"} in GiftMind memory
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {(recipient.interests ?? []).slice(0, 3).map((interest) => (
                      <span key={interest} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {interest}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

        {!isLoading && lockedRecipients.length > 0 && (
          <div className="md:col-span-2 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Locked people</p>
            <div className="grid gap-4 md:grid-cols-2">
              {lockedRecipients.map((record) => {
                const recipient = toRecipient(record);
                const relationshipLabel =
                  RELATIONSHIP_TYPES.find((item) => item.value === recipient.relationship)?.label ?? recipient.relationship;
                return (
                  <Card
                    key={recipient.id}
                    className="relative border-2 border-border/60 bg-muted/30 opacity-70"
                    onClick={() => setUpgradeOpen(true)}
                  >
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white grayscale"
                          style={{ backgroundColor: RELATIONSHIP_COLORS[recipient.relationship] || "#7c3aed" }}
                        >
                          {recipient.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{recipient.name}</p>
                          <Badge variant="outline" className="text-[11px]">
                            {relationshipLabel}
                          </Badge>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-muted-foreground">
                        <Lock className="mr-2 inline h-4 w-4" />
                        🔒 Upgrade to use this person in gift sessions
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Someone New — Inline form (Item 5) */}
        <AnimatePresence mode="wait">
          {showInlineForm ? (
            <motion.div
              key="inline-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="md:col-span-2"
            >
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Add a new person</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowInlineForm(false);
                        setInlineForm({ name: "", relationship_type: "", interests: [] });
                      }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="inline-name" className="text-xs">Name *</Label>
                      <Input
                        id="inline-name"
                        value={inlineForm.name}
                        onChange={(e) => setInlineForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Mom, Priya, Alex"
                        maxLength={100}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Relationship *</Label>
                      <Select
                        value={inlineForm.relationship_type}
                        onValueChange={(v) => setInlineForm((prev) => ({ ...prev, relationship_type: v }))}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select" />
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
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Interests (helps AI find better gifts)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {INTEREST_SUGGESTIONS.slice(0, 12).map((tag) => {
                        const selected = inlineForm.interests.includes(tag);
                        return (
                          <Badge
                            key={tag}
                            variant="outline"
                            className={cn(
                              "cursor-pointer text-xs px-2.5 py-1 transition-all duration-150",
                              selected
                                ? "bg-primary text-primary-foreground border-primary scale-[1.02]"
                                : "bg-background text-muted-foreground border-border hover:border-primary/50",
                            )}
                            onClick={() => toggleInlineInterest(tag)}
                          >
                            {tag}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Custom interest"
                        value={customInterest}
                        onChange={(e) => setCustomInterest(e.target.value)}
                        maxLength={50}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addCustomInlineInterest(); }
                        }}
                        className="h-9 text-sm"
                      />
                      <Button type="button" size="sm" variant="outline" onClick={addCustomInlineInterest} className="h-9 px-3 shrink-0">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="hero"
                    className="w-full"
                    onClick={handleInlineSubmit}
                    disabled={addRecipient.isPending}
                  >
                    {addRecipient.isPending ? "Adding…" : "Add & Select"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            !isLoading && (
              <Card
                key="add-card"
                className="cursor-pointer border-2 border-dashed border-border/60 transition-all hover:border-primary/40 hover:bg-primary/5"
                onClick={() => {
                  if (atRecipientLimit) {
                    setUpgradeOpen(true);
                    return;
                  }
                  setShowInlineForm(true);
                }}
              >
                <CardContent className="relative flex min-h-[184px] flex-col items-center justify-center gap-3 p-5 text-center">
                  {atRecipientLimit && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/70 backdrop-blur-[1px]">
                      <div className="space-y-2 px-6 text-center">
                        <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Recipient limit reached</p>
                        <p className="text-xs text-muted-foreground">{planLimits.getUpgradeText("more_recipients")}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Add Someone New</p>
                    <p className="text-sm text-muted-foreground">Create a profile and use it immediately in this flow.</p>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </AnimatePresence>
      </div>

      {/* Smart skip detection — interests nudge (Item B) */}
      <AnimatePresence>
        {selectedRecipientRecord && (selectedRecipientRecord.gift_count_cached ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              GiftMind remembers {selectedRecipientRecord.gift_count_cached} gift
              {selectedRecipientRecord.gift_count_cached === 1 ? "" : "s"} for {selectedRecipientRecord.name}. The AI will suggest something different this time.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRecipient && (selectedRecipient.interests?.length ?? 0) < 3 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Better interests → better results. Add at least 3 interests to get more targeted recommendations.{" "}
              <Link to="/my-people" className="font-medium underline underline-offset-2 hover:text-amber-900">
                Edit in People
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedRecipient && (
        <CrossBorderSelect
          recipientName={selectedRecipient.name}
          recipientCountry={isCrossBorder ? selectedCountry : null}
          savedCountry={selectedRecipient.country}
          onChange={(country) => {
            onRecipientCountryChange(country);
            onCrossBorderChange(Boolean(country));
          }}
        />
      )}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border/60 bg-background/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6">
        <Button
          type="button"
          variant="hero"
          size="lg"
          className="min-h-12 w-full"
          disabled={!selectedRecipient || !selectedRecipientIsActive}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={planLimits.getUpgradePlan("more_recipients")}
        reason={planLimits.getUpgradeText("more_recipients")}
      />
    </div>
  );
}
