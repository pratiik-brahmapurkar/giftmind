import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Clock, Coins, Gift, MessageSquare, Sparkles, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import UpgradeModal from "@/components/pricing/UpgradeModal";
import { useUserPlan } from "@/hooks/useUserPlan";
import { SEOHead } from "@/components/common/SEOHead";
import { ProfileCompletionBanner } from "@/components/dashboard/ProfileCompletionBanner";
import { ActionCardGrid, type DashboardActionCard } from "@/components/dashboard/ActionCardGrid";
import { CreditHealthWidget } from "@/components/dashboard/CreditHealthWidget";
import { OccasionsStrip, getOccasionUrgencyTier, type OccasionUrgencyTier } from "@/components/dashboard/OccasionsStrip";
import { ReengagementBanner } from "@/components/dashboard/ReengagementBanner";
import { SmartGreeting } from "@/components/dashboard/SmartGreeting";
import { AskGiftMindCard } from "@/components/chat/ChatWidget";
import { getDaysSince, useDashboardSegment } from "@/hooks/useDashboardSegment";
import { getProfileCompletionMissingFields, parseOnboardingState } from "@/features/onboarding/utils";
import { parseRecipientImportantDates } from "@/lib/recipients";
import { getOccasionSlugFromLabel, getUpcomingDates, type UpcomingOccasion } from "@/lib/reminders";
import { trackEvent } from "@/lib/posthog";
import type { Tables } from "@/integrations/supabase/types";

type DashboardProfile = Pick<
  Tables<"users">,
  | "credits_balance"
  | "profile_completion_percentage"
  | "full_name"
  | "country"
  | "birthday"
  | "onboarding_state"
  | "last_active_at"
>;
type DashboardRecipient = Pick<Tables<"recipients">, "id" | "name" | "important_dates" | "created_at" | "session_count">;
type DashboardSession = Pick<
  Tables<"gift_sessions">,
  "id" | "occasion" | "status" | "created_at" | "selected_gift_name" | "selected_gift_index" | "recipient_id"
> & {
  ai_response: { recommendations?: Array<{ name?: string; confidence_score?: number | null }> } | null;
  feedback_rating?: string | null;
};
type DashboardActiveSession = Pick<Tables<"gift_sessions">, "id" | "occasion" | "recipient_id" | "created_at">;
type DashboardPendingFeedback = Pick<
  Tables<"gift_sessions">,
  "id" | "occasion" | "recipient_id" | "selected_gift_name" | "created_at"
>;

const confidenceColor = (score: number) => {
  if (score >= 85) return "bg-success/10 text-success border-success/20";
  if (score >= 65) return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
};

const formatOccasion = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const getSessionAgeHours = (createdAt: string | null) => {
  if (!createdAt) return null;
  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / (1000 * 60 * 60)));
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { limits } = useUserPlan();
  const [batchUpgradeOpen, setBatchUpgradeOpen] = useState(false);
  const [reminderUpgradeOpen, setReminderUpgradeOpen] = useState(false);
  const [creditUpgradeOpen, setCreditUpgradeOpen] = useState(false);
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("users")
        .select("credits_balance, profile_completion_percentage, full_name, country, birthday, onboarding_state, last_active_at")
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
      const { data } = await supabase
        .from("recipients")
        .select("id,name,important_dates,created_at,session_count")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: true });
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
        .limit(50);
      return (data || []) as DashboardSession[];
    },
    enabled: !!user,
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["dashboard-active-sessions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("gift_sessions")
        .select("id, occasion, recipient_id, created_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(1);
      return (data || []) as DashboardActiveSession[];
    },
    enabled: !!user,
  });

  const { data: pendingFeedback = [] } = useQuery({
    queryKey: ["dashboard-pending-feedback", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("gift_sessions")
        .select("id, occasion, recipient_id, selected_gift_name, created_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .is("feedback_rating", null)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(3);
      return (data || []) as DashboardPendingFeedback[];
    },
    enabled: !!user,
  });

  const { data: nextRenewal = null } = useQuery({
    queryKey: ["dashboard-credit-renewal", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("credit_batches")
        .select("expires_at")
        .eq("user_id", user.id)
        .eq("is_expired", false)
        .eq("package_name", "monthly_free")
        .order("expires_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data?.expires_at ? new Date(data.expires_at) : null;
    },
    enabled: !!user,
  });

  const credits = profile?.credits_balance ?? 0;
  const recipientCount = recipients.length;
  const sessionCount = sessions.length;
  const hasReminderAccess = limits.reminders > 0;
  const monthlyAllowance = typeof limits.credits === "number" ? limits.credits : Math.max(credits, 15);
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

  const recipientMap = useMemo(() => Object.fromEntries(recipients.map((recipient) => [recipient.id, recipient.name])), [recipients]);
  const upcomingOccasions = useMemo(
    () =>
      getUpcomingDates(
        recipients.map((recipient) => ({
          ...recipient,
          parsedDates: parseRecipientImportantDates(recipient.important_dates),
        })),
      ),
    [recipients],
  );
  const urgentOccasions = useMemo(() => upcomingOccasions.filter((occasion) => occasion.daysUntil <= 7), [upcomingOccasions]);
  const recipientIdsWithSessions = useMemo(
    () => new Set(sessions.map((session) => session.recipient_id).filter(Boolean)),
    [sessions],
  );
  const ungiftedRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.session_count === 0 || !recipientIdsWithSessions.has(recipient.id)),
    [recipientIdsWithSessions, recipients],
  );
  const daysSinceActive = getDaysSince(profile?.last_active_at ?? null);
  const segment = useDashboardSegment({
    recipientCount,
    sessionCount,
    creditsBalance: credits,
    lastActiveAt: profile?.last_active_at ?? null,
    urgentOccasions,
    activeSessionCount: activeSessions.length,
  });

  const navigateToGiftFlow = (options?: { recipientId?: string | null; occasionLabel?: string | null; source?: string }) => {
    const params = new URLSearchParams();
    if (options?.recipientId) params.set("recipient", options.recipientId);
    if (options?.source) params.set("source", options.source);
    const occasionSlug = options?.occasionLabel ? getOccasionSlugFromLabel(options.occasionLabel) : null;
    if (occasionSlug) params.set("occasion", occasionSlug);

    navigate(`/gift-flow${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleOccasionGift = (occasion: UpcomingOccasion, tier: OccasionUrgencyTier) => {
    trackEvent("occasions_strip_occasion_clicked", {
      recipient_id: occasion.recipientId,
      days_until: occasion.daysUntil,
      urgency_tier: tier,
    });
    navigateToGiftFlow({
      recipientId: occasion.recipientId,
      occasionLabel: occasion.label,
      source: "dashboard_occasions_strip",
    });
  };

  const primaryAction = () => {
    const activeSession = activeSessions[0];
    const urgentOccasion = urgentOccasions[0];

    if (segment === "new_user") {
      navigate("/my-people");
      return;
    }
    if (segment === "in_progress" && activeSession) {
      const ageHours = getSessionAgeHours(activeSession.created_at);
      trackEvent("resume_session_clicked", {
        session_id: activeSession.id,
        session_age_hours: ageHours,
      });
      navigate(`/gift-flow?resume=${activeSession.id}`);
      return;
    }
    if (segment === "occasion_urgent" && urgentOccasion) {
      handleOccasionGift(urgentOccasion, getOccasionUrgencyTier(urgentOccasion.daysUntil));
      return;
    }
    navigateToGiftFlow({ source: "dashboard_primary" });
  };

  const actions = useMemo<DashboardActionCard[]>(() => {
    const rankedActions: DashboardActionCard[] = [];
    const activeSession = activeSessions[0];
    const urgentOccasion = upcomingOccasions.find((occasion) => occasion.daysUntil <= 14);
    const pending = pendingFeedback[0];
    const ungifted = ungiftedRecipients[0];
    const canAddRecipient = limits.recipients === -1 || recipientCount < limits.recipients;

    const withTracking = (action: DashboardActionCard): DashboardActionCard => ({
      ...action,
      onClick: () => {
        trackEvent("action_card_clicked", {
          card_id: action.id,
          segment,
          urgency: action.urgency,
        });
        action.onClick();
      },
    });

    if (activeSession) {
      const ageHours = getSessionAgeHours(activeSession.created_at);
      rankedActions.push(withTracking({
        id: "resume_active_session",
        title: "Resume your latest session",
        description: `${recipientMap[activeSession.recipient_id ?? ""] ?? "A gift search"} is still in progress.`,
        cta: "Resume",
        urgency: "high",
        icon: Clock,
        onClick: () => {
          trackEvent("resume_session_clicked", {
            session_id: activeSession.id,
            session_age_hours: ageHours,
          });
          navigate(`/gift-flow?resume=${activeSession.id}`);
        },
      }));
    }

    if (credits <= 1) {
      rankedActions.push(withTracking({
        id: "low_credits",
        title: credits <= 0 ? "You are out of credits" : "You have one credit left",
        description: "Get more credits before starting a longer gift search.",
        cta: "Get Credits",
        urgency: "high",
        icon: Coins,
        onClick: () => setCreditUpgradeOpen(true),
      }));
    }

    if (urgentOccasion && sessions.some((session) => session.recipient_id === urgentOccasion.recipientId && session.status === "completed")) {
      rankedActions.push(withTracking({
        id: "regift_upcoming",
        title: `Plan for ${urgentOccasion.recipientName}`,
        description: `${urgentOccasion.label} is ${urgentOccasion.daysUntil === 0 ? "today" : `in ${urgentOccasion.daysUntil} days`}. Use past gift context.`,
        cta: "Find a Gift",
        urgency: urgentOccasion.daysUntil <= 7 ? "high" : "medium",
        icon: CalendarDays,
        onClick: () => handleOccasionGift(urgentOccasion, getOccasionUrgencyTier(urgentOccasion.daysUntil)),
      }));
    }

    if (pending) {
      const daysSinceSession = getDaysSince(pending.created_at) ?? 0;
      rankedActions.push(withTracking({
        id: "pending_feedback",
        title: "Rate a recent gift",
        description: pending.selected_gift_name ? `Tell us how ${pending.selected_gift_name} worked out.` : "Feedback improves future recommendations.",
        cta: "Add Feedback",
        urgency: "medium",
        icon: MessageSquare,
        onClick: () => {
          trackEvent("feedback_card_clicked", {
            session_id: pending.id,
            days_since_session: daysSinceSession,
          });
          navigate(`/gift-history?session=${pending.id}&feedback=true`);
        },
      }));
    }

    if (ungifted) {
      rankedActions.push(withTracking({
        id: "ungifted_recipient",
        title: `Find a first gift for ${ungifted.name}`,
        description: "This saved person does not have gift history yet.",
        cta: "Start",
        urgency: "medium",
        icon: Gift,
        onClick: () => navigateToGiftFlow({ recipientId: ungifted.id, source: "dashboard_ungifted" }),
      }));
    }

    if (profileCompletion < 80) {
      rankedActions.push(withTracking({
        id: "profile_incomplete",
        title: "Improve your recommendations",
        description: "Finish your profile so GiftMind can tune suggestions to your style.",
        cta: "Finish Setup",
        urgency: "low",
        icon: Sparkles,
        onClick: () => navigate("/onboarding?resume=true"),
      }));
    }

    if (canAddRecipient) {
      rankedActions.push(withTracking({
        id: "add_person",
        title: "Add another person",
        description: "Save another profile before the next occasion sneaks up.",
        cta: "Add Person",
        urgency: "low",
        icon: UserPlus,
        onClick: () => navigate("/my-people"),
      }));
    }

    rankedActions.push(withTracking({
      id: "generic_find_gift",
      title: "Start a fresh gift search",
      description: "Choose a person, occasion, and budget for ranked recommendations.",
      cta: "Find a Gift",
      urgency: "low",
      icon: Gift,
      onClick: () => navigateToGiftFlow({ source: "dashboard_action" }),
    }));

    return rankedActions;
  }, [activeSessions, credits, limits.recipients, navigate, pendingFeedback, profileCompletion, recipientCount, recipientMap, segment, sessions, ungiftedRecipients, upcomingOccasions]);

  useEffect(() => {
    if (isDashboardLoading || !user) return;

    trackEvent("dashboard_segment_viewed", {
      segment,
      recipient_count: recipientCount,
      session_count: sessionCount,
      credits_balance: credits,
      urgent_occasions: urgentOccasions.length,
    });
  }, [credits, isDashboardLoading, recipientCount, segment, sessionCount, urgentOccasions.length, user]);

  if (isDashboardLoading) {
    return (
      <DashboardLayout>
        <SEOHead title="Dashboard" description="Your GiftMind dashboard" noIndex={true} />
        <div className="mx-auto max-w-6xl space-y-6 pb-20 md:pb-0">
          <Skeleton className="h-10 w-96 max-w-full rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((idx) => (
              <Skeleton key={idx} className="h-[120px] w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[180px] w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SEOHead title="Dashboard" description="Your GiftMind dashboard" noIndex={true} />
      <div className="mx-auto max-w-6xl space-y-6 pb-20 md:pb-0">
        <SmartGreeting firstName={firstName} segment={segment} onPrimaryAction={primaryAction} />
        <AskGiftMindCard />

        {segment === "dormant" ? (
          <ReengagementBanner
            daysSinceActive={daysSinceActive}
            upcomingCount={upcomingOccasions.length}
            ungiftedCount={ungiftedRecipients.length}
            onFindGift={() => navigateToGiftFlow({ source: "dashboard_reengagement" })}
          />
        ) : (
          <ProfileCompletionBanner
            completionPercentage={profileCompletion}
            sessionCount={sessionCount}
            missingFields={missingFields}
            onClick={() => navigate("/onboarding?resume=true")}
          />
        )}

        {segment === "new_user" ? (
          <Card className="border-dashed border-border/70 bg-card shadow-sm">
            <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-dashed border-primary/30 bg-primary/8">
                <Gift className="h-11 w-11 text-primary" />
              </div>
              <div className="max-w-xl space-y-2">
                <h2 className="font-heading text-2xl font-semibold text-foreground">Let's set up your gifting circle</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Add someone you care about. GiftMind will remember occasions and gift history for each person.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button type="button" variant="hero" onClick={() => navigate("/my-people")}>
                  Add your first person
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" disabled>
                  Import from contacts
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {segment === "exploring" ? (
              <Card className="border-border/60 bg-card shadow-sm">
                <CardContent className="space-y-5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/8">
                      <Sparkles className="h-7 w-7 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h2 className="font-heading text-xl font-semibold text-foreground">You're all set to find your first gift</h2>
                      <p className="text-sm text-muted-foreground">
                        Pick one of your {recipientCount} saved {recipientCount === 1 ? "person" : "people"} and get 3 gift ideas with confidence scores.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recipients.slice(0, 6).map((recipient) => (
                      <Button key={recipient.id} type="button" variant="outline" size="sm" onClick={() => navigateToGiftFlow({ recipientId: recipient.id, source: "dashboard_exploring" })}>
                        {recipient.name}
                      </Button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/my-people")}>
                      Browse all people
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <OccasionsStrip
              occasions={upcomingOccasions}
              isLocked={!hasReminderAccess}
              onManage={() => navigate("/my-people")}
              onUpgrade={() => {
                trackEvent("upcoming_occasions_upgrade_clicked", {
                  count: upcomingOccasions.length,
                });
                setReminderUpgradeOpen(true);
              }}
              onFindGift={handleOccasionGift}
            />

            <div className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
              <div className="space-y-5">
                <ActionCardGrid actions={actions} />

                <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-xl font-semibold text-foreground">Recent gift sessions</h2>
                      <p className="text-sm text-muted-foreground">Resume, review, or reuse context from recent searches.</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/gift-history")}>
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {sessions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center">
                      <p className="text-sm font-medium text-foreground">No gift sessions yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Start with a saved person above.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {sessions.slice(0, 5).map((session) => {
                        const recipientName = recipientMap[session.recipient_id ?? ""] || "Unknown";
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
                            className="border-border/50 bg-background transition-all hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
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
                                  {session.created_at
                                    ? new Date(session.created_at).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })
                                    : "Recently"}
                                </p>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {confidence !== null ? (
                                  <Badge variant="default" className={cn("shrink-0", confidenceColor(confidence))}>
                                    {confidence}%
                                  </Badge>
                                ) : null}
                                <Button
                                  type="button"
                                  variant={isCompleted ? "outline" : "hero"}
                                  size="sm"
                                  onClick={() => {
                                    if (isCompleted) {
                                      navigateToGiftFlow({
                                        recipientId: session.recipient_id,
                                        occasionLabel: session.occasion,
                                        source: "dashboard_recent_regift",
                                      });
                                    } else {
                                      const ageHours = getSessionAgeHours(session.created_at);
                                      trackEvent("resume_session_clicked", {
                                        session_id: session.id,
                                        session_age_hours: ageHours,
                                      });
                                      navigate(`/gift-flow?resume=${session.id}`);
                                    }
                                  }}
                                >
                                  {isCompleted ? "Regift" : "Resume"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-5">
                <CreditHealthWidget
                  creditsBalance={credits}
                  monthlyAllowance={monthlyAllowance}
                  renewalDate={nextRenewal}
                  onTopUp={() => {
                    trackEvent("credit_health_widget_topup_clicked", {
                      credits_balance: credits,
                    });
                    setCreditUpgradeOpen(true);
                  }}
                />

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    { label: "Gifts found", value: sessionCount, icon: Gift, note: "Recent sessions" },
                    { label: "People saved", value: recipientCount, icon: Users, note: limits.recipients === -1 ? "Unlimited profiles" : `${Math.max(limits.recipients - recipientCount, 0)} slots left` },
                  ].map((stat) => (
                    <Card key={stat.label} className="border-border/60 bg-card shadow-sm">
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                          <stat.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <span className="block font-heading text-3xl font-bold leading-none text-foreground">{stat.value}</span>
                          <span className="mt-1 block text-sm font-medium text-foreground">{stat.label}</span>
                          <span className="text-xs text-muted-foreground">{stat.note}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {!limits.hasBatchMode && (
                  <Card
                    className="cursor-pointer border-border/60 border-dashed bg-muted/20 transition-colors hover:bg-muted/40"
                    onClick={() => setBatchUpgradeOpen(true)}
                  >
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
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
          </>
        )}
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
      <UpgradeModal
        open={creditUpgradeOpen}
        onOpenChange={setCreditUpgradeOpen}
        highlightPlan="pro"
        reason="More credits are coming with Pro. Join the waitlist to unlock higher limits when Pro launches."
      />
    </DashboardLayout>
  );
};

export default Dashboard;
