import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, ArrowRight, Gift, Coins, Users, Clock, Lock } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { EmptyState } from "@/components/ui/empty-state";
import { UpcomingOccasionsWidget } from "@/components/dashboard/UpcomingOccasionsWidget";
import { useUserPlan } from "@/hooks/useUserPlan";
import { motion } from "framer-motion";
import { SEOHead } from "@/components/common/SEOHead";
import { ProfileCompletionBanner } from "@/components/dashboard/ProfileCompletionBanner";
import { getProfileCompletionMissingFields, parseOnboardingState } from "@/features/onboarding/utils";
import { parseRecipientImportantDates } from "@/lib/recipients";
import { getOccasionSlugFromLabel, getUpcomingDates } from "@/lib/reminders";
import { trackEvent } from "@/lib/posthog";
import type { Tables } from "@/integrations/supabase/types";

type DashboardProfile = Pick<
  Tables<"users">,
  "credits_balance" | "profile_completion_percentage" | "full_name" | "country" | "birthday" | "onboarding_state"
>;
type DashboardRecipient = Pick<Tables<"recipients">, "id" | "name" | "important_dates">;
type DashboardSession = Pick<
  Tables<"gift_sessions">,
  "id" | "occasion" | "status" | "created_at" | "selected_gift_name" | "selected_gift_index" | "recipient_id"
> & {
  ai_response: { recommendations?: Array<{ name?: string; confidence_score?: number | null }> } | null;
};

const confidenceColor = (score: number) => {
  if (score >= 85) return "bg-success/10 text-success border-success/20";
  if (score >= 65) return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { limits } = useUserPlan();
  const [batchUpgradeOpen, setBatchUpgradeOpen] = useState(false);
  const [reminderUpgradeOpen, setReminderUpgradeOpen] = useState(false);
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  // Fetch real data
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("users")
        .select("credits_balance, profile_completion_percentage, full_name, country, birthday, onboarding_state")
        .eq("id", user.id)
        .single();
      return data as DashboardProfile | null;
    },
    enabled: !!user,
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["dashboard-recipients", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("recipients").select("id,name,important_dates").eq("user_id", user.id);
      return (data || []) as DashboardRecipient[];
    },
    enabled: !!user,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["dashboard-sessions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("gift_sessions")
        .select("id,occasion,status,created_at,selected_gift_name,selected_gift_index,ai_response,recipient_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data || []) as DashboardSession[];
    },
    enabled: !!user,
  });

  const credits = profile?.credits_balance ?? 0;
  const recipientCount = recipients.length;
  const sessionCount = sessions.length;
  const upcomingOccasions = getUpcomingDates(
    recipients.map((recipient) => ({
      ...recipient,
      parsedDates: parseRecipientImportantDates(recipient.important_dates),
    })),
  );
  const hasReminderAccess = limits.reminders > 0;
  const isDashboardLoading = profileLoading || recipientsLoading || sessionsLoading;
  const onboardingState = parseOnboardingState(profile?.onboarding_state ?? null);
  const profileCompletion = profile?.profile_completion_percentage ?? 0;
  const missingFields = getProfileCompletionMissingFields({
    fullName: profile?.full_name,
    country: profile?.country,
    recipientCount,
    birthday: profile?.birthday,
    audience: onboardingState.audience,
    giftStyle: onboardingState.gift_style,
  });

  // Build a lookup of recipient names
  const recipientMap = Object.fromEntries(recipients.map((r) => [r.id, r.name]));

  if (isDashboardLoading) {
    return (
      <DashboardLayout>
        <SEOHead title="Dashboard" description="Your GiftMind dashboard" noIndex={true} />
        <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
          <Skeleton className="h-10 w-96 max-w-full rounded-lg" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((idx) => (
              <Skeleton key={idx} className="h-[120px] w-full rounded-xl" />
            ))}
          </div>

          <div className="space-y-3">
            <Skeleton className="h-6 w-48 rounded-md" />
            {[1, 2, 3].map((idx) => (
              <Skeleton key={idx} className="h-[88px] w-full rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── State: No recipients ── */
  if (recipientCount === 0) {
    return (
      <DashboardLayout>
        <SEOHead title="Dashboard" description="Your GiftMind dashboard" noIndex={true} />
        <div className="max-w-2xl mx-auto min-h-[60vh] flex items-center justify-center pb-20 md:pb-0">
          <div className="w-full space-y-6">
            <ProfileCompletionBanner
              completionPercentage={profileCompletion}
              sessionCount={sessionCount}
              missingFields={missingFields}
              onClick={() => navigate("/onboarding?resume=true")}
            />
            <EmptyState
              title="Welcome to GiftMind"
              description="Let's start by adding someone you'd like to gift. GiftMind will remember what matters to each of them."
              actionLabel="Add your first person"
              onAction={() => navigate("/my-people")}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── State: Has recipients but no sessions ── */
  if (sessionCount === 0) {
    return (
      <DashboardLayout>
        <SEOHead title="Dashboard" description="Your GiftMind dashboard" noIndex={true} />
        <div className="max-w-2xl mx-auto min-h-[60vh] flex items-center justify-center pb-20 md:pb-0">
          <div className="w-full space-y-6">
            <ProfileCompletionBanner
              completionPercentage={profileCompletion}
              sessionCount={sessionCount}
              missingFields={missingFields}
              onClick={() => navigate("/onboarding?resume=true")}
            />
            <EmptyState
              title={`You've added ${recipientCount} ${recipientCount === 1 ? "person" : "people"}`}
              description="Ready to find the perfect gift? Start a new recommendation session."
              actionLabel="Find a Gift"
              onAction={() => navigate("/gift-flow")}
              icon={<Gift className="w-12 h-12" strokeWidth={1.5} />}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── State: Normal dashboard ── */
  return (
    <DashboardLayout>
      <SEOHead title="Dashboard" description="Your GiftMind dashboard" noIndex={true} />
      <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
        <ProfileCompletionBanner
          completionPercentage={profileCompletion}
          sessionCount={sessionCount}
          missingFields={missingFields}
          onClick={() => navigate("/onboarding?resume=true")}
        />

        {/* Welcome */}
        <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
          Hi {firstName}, who are we finding a gift for today?
        </h1>

        {/* Primary CTA */}
        <motion.div whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 400 }}>
          <Card className="gradient-primary cursor-pointer group overflow-hidden border-0 shadow-lg" onClick={() => navigate("/gift-flow")}>
            <CardContent className="flex items-center justify-between p-6 md:p-8">
              <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-heading font-bold text-primary-foreground">Find the Perfect Gift</h2>
                <p className="text-primary-foreground/80 text-sm">AI-powered recommendations with confidence scores</p>
              </div>
              <div className="relative">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center group-hover:bg-primary-foreground/30 transition-colors">
                  <Sparkles className="w-7 h-7 md:w-8 md:h-8 text-primary-foreground group-hover:animate-wiggle" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {upcomingOccasions.length > 0 && (
          <UpcomingOccasionsWidget
            occasions={upcomingOccasions}
            isLocked={!hasReminderAccess}
            onManage={() => navigate("/my-people")}
            onUpgrade={() => setReminderUpgradeOpen(true)}
            onFindGift={(occasion) => {
              trackEvent("upcoming_occasions_gift_clicked", {
                recipient_id: occasion.recipientId,
                label: occasion.label,
                days_until: occasion.daysUntil,
              });

              const params = new URLSearchParams({
                recipient: occasion.recipientId,
                source: "dashboard_upcoming",
              });
              const occasionSlug = getOccasionSlugFromLabel(occasion.label);
              if (occasionSlug) {
                params.set("occasion", occasionSlug);
              }

              navigate(`/gift-flow?${params.toString()}`);
            }}
          />
        )}

        {/* Quick stats — horizontal scroll on mobile */}
        <div className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3">
          {[
            { label: "Gifts Found", value: sessionCount, icon: Gift, note: null },
            { label: "People Saved", value: recipientCount, icon: Users, note: null },
            { label: "Credits Left", value: credits, icon: Coins, note: credits <= 3 ? "Running low" : null },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50 snap-center shrink-0 w-40 md:w-auto">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <span className="text-2xl font-heading font-bold text-foreground block leading-none">{stat.value}</span>
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                  {stat.note && <span className="text-[10px] text-warning block">{stat.note}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Sessions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-heading font-semibold text-foreground">Recent Gift Sessions</h2>
            <button onClick={() => navigate("/gift-history")} className="text-xs text-primary font-medium hover:underline">
              View all →
            </button>
          </div>

          <div className="grid gap-3">
            {sessions.slice(0, 5).map((session) => {
              const recipientName = recipientMap[session.recipient_id] || "Unknown";
              const initial = recipientName[0]?.toUpperCase() || "?";
              const isCompleted = session.status === "completed";
              const recommendations = session.ai_response && typeof session.ai_response === "object"
                ? (session.ai_response.recommendations || [])
                : [];
              const chosenGiftName = session.selected_gift_name ||
                (typeof session.selected_gift_index === "number" && Array.isArray(recommendations)
                  ? recommendations[session.selected_gift_index]?.name || null
                  : null);

              // Extract confidence from results if available
              let confidence: number | null = null;
              if (Array.isArray(recommendations) && recommendations.length > 0) {
                if (typeof session.selected_gift_index === "number" && recommendations[session.selected_gift_index]) {
                  confidence = recommendations[session.selected_gift_index]?.confidence_score ?? null;
                } else {
                  confidence = recommendations[0]?.confidence_score ?? null;
                }
              }

              return (
                <Card key={session.id} className="border-border/50 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate("/gift-history")}>
                  <CardContent className="flex items-center gap-3 p-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
                      {initial}
                    </div>

                    {/* Middle */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{recipientName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {session.occasion && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{session.occasion}</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {isCompleted && chosenGiftName ? (
                        <p className="text-xs text-muted-foreground mt-1 truncate">🎁 {chosenGiftName}</p>
                      ) : (
                        <p className="text-xs text-warning mt-1">In progress</p>
                      )}
                    </div>

                    {confidence !== null && (
                      <Badge variant="default" className={cn("shrink-0", confidenceColor(confidence))}>
                        {confidence}%
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Batch mode card */}
        {!limits.hasBatchMode && (
          <Card
            className="border-border/50 border-dashed cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setBatchUpgradeOpen(true)}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Batch Mode</p>
                <p className="text-xs text-muted-foreground">
                  Find gifts for your entire Diwali list in one session. Available on Confident and above.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <UpgradeModal
        open={batchUpgradeOpen}
        onOpenChange={setBatchUpgradeOpen}
        highlightPlan="confident"
        reason="Batch mode is available on Confident and above. Find gifts for your entire Diwali list in one session."
      />
      <UpgradeModal
        open={reminderUpgradeOpen}
        onOpenChange={setReminderUpgradeOpen}
        highlightPlan="confident"
        reason="Occasion reminders are available on Confident and above."
      />
    </DashboardLayout>
  );
};

export default Dashboard;
