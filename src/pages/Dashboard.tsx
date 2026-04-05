import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Gift, Coins, Users, Clock } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";

const confidenceColor = (score: number) => {
  if (score >= 85) return "bg-success/10 text-success border-success/20";
  if (score >= 65) return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  // Fetch real data
  const { data: profile } = useQuery({
    queryKey: ["dashboard-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("credits").eq("user_id", user.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: recipients = [] } = useQuery({
    queryKey: ["dashboard-recipients", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("recipients").select("id, name").eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dashboard-sessions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("gift_sessions")
        .select("id, occasion, status, created_at, chosen_gift, results, recipient_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user,
  });

  const credits = profile?.credits ?? 0;
  const recipientCount = recipients.length;
  const sessionCount = sessions.length;

  // Build a lookup of recipient names
  const recipientMap = Object.fromEntries(recipients.map((r: any) => [r.id, r.name]));

  /* ── State: No recipients ── */
  if (recipientCount === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 pb-20 md:pb-0">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center animate-gift-bounce">
            <Gift className="w-10 h-10 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground mb-2">
              👋 Welcome! Let's find your first perfect gift.
            </h1>
            <p className="text-muted-foreground">Start by adding someone you care about →</p>
          </div>
          <Button variant="hero" size="lg" className="h-14 text-base px-8" onClick={() => navigate("/my-people")}>
            Add Your First Person <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  /* ── State: Has recipients but no sessions ── */
  if (sessionCount === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 pb-20 md:pb-0">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground mb-2">
              You've added {recipientCount} {recipientCount === 1 ? "person" : "people"}. Ready to find a gift?
            </h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="hero" size="lg" onClick={() => navigate("/gift-flow")}>
              Find a Gift <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/my-people")}>
              Add another person
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── State: Normal dashboard ── */
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
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
            {sessions.slice(0, 5).map((session: any) => {
              const recipientName = recipientMap[session.recipient_id] || "Unknown";
              const initial = recipientName[0]?.toUpperCase() || "?";
              const isCompleted = session.status === "completed";
              const chosenGiftName = session.chosen_gift && typeof session.chosen_gift === "object"
                ? (session.chosen_gift as any).name || "Gift selected"
                : null;

              // Extract confidence from results if available
              let confidence: number | null = null;
              if (session.results && Array.isArray(session.results) && session.results.length > 0) {
                confidence = (session.results[0] as any)?.confidence ?? null;
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

                    {/* Confidence */}
                    {confidence !== null && (
                      <Badge variant="outline" className={cn("shrink-0", confidenceColor(confidence))}>
                        {confidence}%
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
