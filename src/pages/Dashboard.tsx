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
import { Sparkles, ArrowRight, Gift, Coins, Users, Clock, Lock, CalendarDays, CheckCircle2 } from "lucide-react";
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

const formatOccasion = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

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
      <div className="mx-auto max-w-6xl space-y-6 pb-20 md:pb-0">
        <ProfileCompletionBanner
          completionPercentage={profileCompletion}
          sessionCount={sessionCount}
          missingFields={missingFields}
          onClick={() => navigate("/onboarding?resume=true")}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              <Sparkles className="h-3.5 w-3.5" />
              GiftMind Dashboard
            </p>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Hi {firstName}, ready for the next thoughtful pick?
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              Start a new recommendation, check upcoming dates, or revisit recent gift sessions.
            </p>
          </div>
          <Button type="button" variant="hero" className="h-11 w-full md:w-auto" onClick={() => navigate("/gift-flow")}>
            Find a Gift
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
          <div className="space-y-5">
            <motion.div whileHover={{ scale: 1.008 }} transition={{ type: "spring", stiffness: 400 }}>
              <Card
                className="group cursor-pointer overflow-hidden rounded-3xl border-0 bg-[#C79235] shadow-[0_20px_60px_rgba(104,70,24,0.18)]"
                onClick={() => navigate("/gift-flow")}
              >
                <CardContent className="relative min-h-[210px] p-6 md:p-8">
                  <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_70%_35%,rgba(255,255,255,0.22),transparent_35%)]" />
                  <div className="relative flex h-full flex-col justify-between gap-10">
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-3 py-1 text-xs font-semibold text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        AI recommendations with confidence scores
                      </div>
                      <div className="space-y-2">
                        <h2 className="font-heading text-3xl font-bold leading-tight text-white md:text-4xl">
                          Find the perfect gift
                        </h2>
                        <p className="max-w-md text-sm leading-relaxed text-white/82 md:text-base">
                          Choose a person, occasion, and budget. GiftMind returns ranked ideas with buy links and reasoning.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-semibold text-white">
                      Start recommendation
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 transition-colors group-hover:bg-white/28">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-6 right-6 hidden h-20 w-20 items-center justify-center rounded-3xl bg-black/10 text-white md:flex">
                    <Sparkles className="h-10 w-10 group-hover:animate-wiggle" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl font-semibold text-foreground">Recent gift sessions</h2>
                  <p className="text-sm text-muted-foreground">Pick up where you left off or review previous choices.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/gift-history")}>
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Button>
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

                  let confidence: number | null = null;
                  if (Array.isArray(recommendations) && recommendations.length > 0) {
                    if (typeof session.selected_gift_index === "number" && recommendations[session.selected_gift_index]) {
                      confidence = recommendations[session.selected_gift_index]?.confidence_score ?? null;
                    } else {
                      confidence = recommendations[0]?.confidence_score ?? null;
                    }
                  }

                  return (
                    <Card
                      key={session.id}
                      className="cursor-pointer border-border/50 bg-background transition-all hover:-translate-y-0.5 hover:shadow-md"
                      onClick={() => navigate("/gift-history")}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">
                          {initial}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{recipientName}</p>
                            {session.occasion && (
                              <Badge variant="secondary" className="px-2 py-0 text-[10px]">
                                {formatOccasion(session.occasion)}
                              </Badge>
                            )}
                          </div>
                          {isCompleted && chosenGiftName ? (
                            <p className="mt-1 truncate text-sm text-muted-foreground">{chosenGiftName}</p>
                          ) : (
                            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-warning">
                              <Clock className="h-3.5 w-3.5" />
                              In progress
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(session.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>

                        {confidence !== null ? (
                          <Badge variant="default" className={cn("shrink-0", confidenceColor(confidence))}>
                            {confidence}%
                          </Badge>
                        ) : (
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { label: "Gifts found", value: sessionCount, icon: Gift, note: "Total sessions" },
                { label: "People saved", value: recipientCount, icon: Users, note: "Gift profiles" },
                { label: "Credits left", value: credits, icon: Coins, note: credits <= 3 ? "Running low" : "Available now" },
              ].map((stat) => (
                <Card key={stat.label} className="border-border/60 bg-card shadow-sm">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                      <stat.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-heading text-3xl font-bold leading-none text-foreground">{stat.value}</span>
                      <span className="mt-1 block text-sm font-medium text-foreground">{stat.label}</span>
                      <span className={cn("text-xs text-muted-foreground", stat.label === "Credits left" && credits <= 3 && "text-warning")}>
                        {stat.note}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {upcomingOccasions.length > 0 ? (
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
            ) : (
              <Card className="border-border/60 bg-card shadow-sm">
                <CardContent className="space-y-3 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">No upcoming dates yet</p>
                    <p className="text-sm text-muted-foreground">
                      Add birthdays and anniversaries to people profiles to plan ahead.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate("/my-people")}>
                    Manage people
                  </Button>
                </CardContent>
              </Card>
            )}

            {!limits.hasBatchMode && (
              <Card
                className="cursor-pointer border-border/60 border-dashed bg-muted/20 transition-colors hover:bg-muted/40"
                onClick={() => setBatchUpgradeOpen(true)}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Batch Mode</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Find gifts for your entire list in one session. Coming soon with Pro.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>

      <UpgradeModal
        open={batchUpgradeOpen}
        onOpenChange={setBatchUpgradeOpen}
        highlightPlan="pro"
        reason="Batch mode is a Pro feature. Find gifts for your entire list in one session."
      />
      <UpgradeModal
        open={reminderUpgradeOpen}
        onOpenChange={setReminderUpgradeOpen}
        highlightPlan="pro"
        reason="Unlimited occasion reminders are coming with Pro."
      />
    </DashboardLayout>
  );
};

export default Dashboard;
