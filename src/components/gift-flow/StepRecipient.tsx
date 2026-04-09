import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Check } from "lucide-react";
import { RELATIONSHIP_TYPES } from "@/components/recipients/constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import RecipientFormModal from "@/components/recipients/RecipientFormModal";
import CrossBorderSection from "./CrossBorderSection";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RecipientFormData } from "@/components/recipients/constants";
import { detectUserCountry, SUPPORTED_COUNTRIES } from "./constants";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import UpgradeModal from "@/components/pricing/UpgradeModal";

const AVATAR_COLORS: Record<string, string> = {
  partner: "bg-[hsl(0,73%,71%)]",
  parent: "bg-[hsl(249,76%,65%)]",
  sibling: "bg-[hsl(249,98%,80%)]",
  close_friend: "bg-[hsl(153,53%,53%)]",
  friend: "bg-[hsl(153,53%,53%)]",
  colleague: "bg-[hsl(45,98%,71%)]",
  boss: "bg-[hsl(45,98%,71%)]",
  new_relationship: "bg-[hsl(0,100%,86%)]",
};

interface StepRecipientProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  recipientCountry: string;
  onRecipientCountryChange: (country: string) => void;
}

const StepRecipient = ({ selectedId, onSelect, recipientCountry, onRecipientCountryChange }: StepRecipientProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inlineFormOpen, setInlineFormOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const planLimits = usePlanLimits();
  const userCountry = detectUserCountry();

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["recipients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("id, name, relationship_type, interests, country")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // When a recipient is selected and they have a saved country, auto-populate
  const selectedRecipient = recipients.find((r: any) => r.id === selectedId);

  const handleSelect = (id: string) => {
    onSelect(id);
    const recipient = recipients.find((r: any) => r.id === id);
    if (recipient?.country) {
      onRecipientCountryChange(recipient.country);
    } else {
      onRecipientCountryChange(detectUserCountry());
    }
  };

  const handleCountryChange = async (country: string) => {
    onRecipientCountryChange(country);
    // Persist to recipient profile
    if (selectedId) {
      await supabase
        .from("recipients")
        .update({ country } as any)
        .eq("id", selectedId);
    }
  };

  const addMutation = useMutation({
    mutationFn: async (form: RecipientFormData) => {
      const { data, error } = await supabase
        .from("recipients")
        .insert({
          user_id: user!.id,
          name: form.name,
          relationship_type: form.relationship_type as any,
          relationship_depth: form.relationship_depth as any,
          age_range: form.age_range ? (form.age_range as any) : null,
          gender: form.gender ? (form.gender as any) : null,
          interests: form.interests,
          cultural_context: form.cultural_context ? (form.cultural_context as any) : null,
          country: form.country || null,
          notes: form.notes || null,
          important_dates: form.important_dates as any,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      handleSelect(data.id);
      setInlineFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      toast.success("Person added!");
    },
    onError: () => toast.error("Failed to add person"),
  });

  // 0 recipients — show inline form directly
  if (!isLoading && recipients.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
            Who is this gift for?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add the person you want to find a gift for
          </p>
        </div>
        <RecipientFormModal
          open={true}
          onOpenChange={() => {}}
          onSubmit={(data) => addMutation.mutate(data)}
          loading={addMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Who is this gift for?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select a saved person or add someone new
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted mb-2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recipients.map((r: any) => {
            const avatarColor = AVATAR_COLORS[r.relationship_type] || "bg-primary";
            const relLabel = RELATIONSHIP_TYPES.find((t) => t.value === r.relationship_type)?.label;
            const isSelected = selectedId === r.id;
            return (
              <Card
                key={r.id}
                className={cn(
                  "cursor-pointer border-2 transition-all hover:shadow-md relative",
                  isSelected
                    ? "border-primary shadow-md bg-primary/5"
                    : "border-border/50 hover:border-primary/30"
                )}
                onClick={() => handleSelect(r.id)}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                )}
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0",
                      avatarColor
                    )}
                  >
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-foreground truncate">{r.name}</p>
                      {r.country && r.country !== userCountry && (
                        <span className="shrink-0 text-sm leading-none" title={SUPPORTED_COUNTRIES.find(c => c.code === r.country)?.name}>
                          {SUPPORTED_COUNTRIES.find(c => c.code === r.country)?.flag}
                        </span>
                      )}
                    </div>
                    {relLabel && (
                      <Badge variant="outline" className="text-[9px] mt-0.5">{relLabel}</Badge>
                    )}
                    {r.interests && r.interests.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                        {(r.interests as string[]).slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add new card */}
          <Card
            className="cursor-pointer border-2 border-dashed border-border/50 hover:border-primary/30 transition-all"
            onClick={() => {
              if (!planLimits.canAddRecipient(recipients.length)) {
                setUpgradeOpen(true);
              } else {
                setInlineFormOpen(true);
              }
            }}
          >
            <CardContent className="p-4 flex flex-col items-center justify-center text-center min-h-[80px]">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Add Someone New</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cross-border section — only visible when a recipient is selected */}
      {selectedId && selectedRecipient && (
        <CrossBorderSection
          recipientName={selectedRecipient.name}
          recipientCountry={recipientCountry}
          onCountryChange={handleCountryChange}
        />
      )}

      <RecipientFormModal
        open={inlineFormOpen}
        onOpenChange={setInlineFormOpen}
        onSubmit={(data) => addMutation.mutate(data)}
        loading={addMutation.isPending}
      />

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        highlightPlan={planLimits.getUpgradePlan("more_recipients") as any}
        reason="Upgrade to add more people to your gifting list."
      />
    </div>
  );
};

export default StepRecipient;
