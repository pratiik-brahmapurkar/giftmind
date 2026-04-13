import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RecipientFormModal from "@/components/recipients/RecipientFormModal";
import type { RecipientFormData } from "@/components/recipients/constants";
import { RELATIONSHIP_TYPES } from "@/components/recipients/constants";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import type { Recipient } from "@/hooks/useGiftSession";
import { RELATIONSHIP_COLORS } from "@/lib/geoConfig";
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

export default function StepRecipient({
  selectedRecipient,
  onSelectRecipient,
  recipientCountry,
  onRecipientCountryChange,
  isCrossBorder,
  onCrossBorderChange,
  onContinue,
}: StepRecipientProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const planLimits = usePlanLimits();
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["gift-flow-recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as RecipientRecord[];
    },
    enabled: !!user,
  });

  const addRecipient = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw createRecipientAuthError("You must be logged in to add a person");

      const payload = buildRecipientInsertPayload(authUser.id, form);
      const { data, error } = await supabase
        .from("recipients")
        .insert(payload)
        .select("id, name, relationship, relationship_depth, age_range, gender, interests, cultural_context, country, notes")
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
      setModalOpen(false);
      toast.success("Recipient added");
    },
    onError: (error: RecipientMutationError) => {
      toast.error(error.userMessage || "Could not add recipient");
    },
  });

  const selectedCountry = useMemo(
    () => recipientCountry ?? selectedRecipient?.country ?? null,
    [recipientCountry, selectedRecipient?.country],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Who is this for?</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Pick someone you already know in GiftMind or add a new person.
        </p>
      </div>

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
          recipients.map((record) => {
            const recipient = toRecipient(record);
            const isSelected = selectedRecipient?.id === recipient.id;
            const relationshipLabel =
              RELATIONSHIP_TYPES.find((item) => item.value === recipient.relationship)?.label ?? recipient.relationship;

            return (
              <Card
                key={recipient.id}
                className={cn(
                  "cursor-pointer border-2 transition-all hover:shadow-md",
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
                      <Badge variant="outline" className="text-[11px]">
                        {relationshipLabel}
                      </Badge>
                    </div>
                  </div>

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

        <Card
          className="cursor-pointer border-2 border-dashed border-border/60 transition-all hover:border-primary/40 hover:bg-primary/5"
          onClick={() => {
            if (!planLimits.canAddRecipient(recipients.length)) {
              setUpgradeOpen(true);
              return;
            }
            setModalOpen(true);
          }}
        >
          <CardContent className="relative flex min-h-[184px] flex-col items-center justify-center gap-3 p-5 text-center">
            {!planLimits.canAddRecipient(recipients.length) && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/70 backdrop-blur-[1px]">
                <div className="space-y-2 px-6 text-center">
                  <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Recipient limit reached</p>
                  <p className="text-xs text-muted-foreground">Upgrade from {planLimits.plan} to add more people.</p>
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
      </div>

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

      <Button type="button" variant="hero" size="lg" className="min-h-12 w-full" disabled={!selectedRecipient} onClick={onContinue}>
        Continue
      </Button>

      <RecipientFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={(form) => addRecipient.mutate(form)}
        loading={addRecipient.isPending}
      />

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan="starter"
        reason="Upgrade to add more recipients to GiftMind."
      />
    </div>
  );
}
