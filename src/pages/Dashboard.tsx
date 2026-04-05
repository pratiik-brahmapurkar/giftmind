import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Gift, Coins, Users, Clock } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { motion } from "framer-motion";

// Mock data – will be replaced with real DB queries
const mockStats = {
  totalGifts: 0,
  creditsRemaining: 47,
  peopleSaved: 0,
};

const mockSessions: {
  id: string;
  recipientName: string;
  occasion: string;
  confidence: number;
  date: string;
}[] = [];

const confidenceColor = (score: number) => {
  if (score >= 85) return "bg-success/10 text-success border-success/20";
  if (score >= 65) return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
            Hi {name}, who are we finding a gift for today?
          </h1>
        </div>

        {/* Primary CTA */}
        <motion.div whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 400 }}>
          <Card
            className="gradient-primary cursor-pointer group overflow-hidden border-0 shadow-lg"
            onClick={() => navigate("/gift-flow")}
          >
            <CardContent className="flex items-center justify-between p-6 md:p-8">
              <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-heading font-bold text-primary-foreground">
                  Find the Perfect Gift
                </h2>
                <p className="text-primary-foreground/80 text-sm">
                  AI-powered recommendations with confidence scores
                </p>
              </div>
              <div className="relative">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center group-hover:bg-primary-foreground/30 transition-colors">
                  <Sparkles className="w-7 h-7 md:w-8 md:h-8 text-primary-foreground group-hover:animate-wiggle" />
                </div>
                <ArrowRight className="absolute -right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { label: "Gifts Found", value: mockStats.totalGifts, icon: Gift },
            { label: "Credits Left", value: mockStats.creditsRemaining, icon: Coins },
            { label: "People Saved", value: mockStats.peopleSaved, icon: Users },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-4 flex flex-col items-center text-center gap-1">
                <stat.icon className="w-5 h-5 text-primary mb-1" />
                <span className="text-2xl font-heading font-bold text-foreground">
                  {stat.value}
                </span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Sessions */}
        <div>
          <h2 className="text-lg font-heading font-semibold text-foreground mb-3">
            Recent Gift Sessions
          </h2>

          {mockSessions.length === 0 ? (
            <Card className="border-border/50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Clock className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground text-sm font-medium mb-1">
                  No gift sessions yet
                </p>
                <p className="text-muted-foreground/70 text-xs max-w-xs">
                  Your gift history will appear here after your first session
                </p>
                <Button
                  variant="hero"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate("/gift-flow")}
                >
                  Start Your First Session <ArrowRight className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {mockSessions.slice(0, 3).map((session) => (
                <Card key={session.id} className="border-border/50 hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Gift className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {session.recipientName}
                        </p>
                        <p className="text-xs text-muted-foreground">{session.occasion}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        variant="outline"
                        className={confidenceColor(session.confidence)}
                      >
                        {session.confidence}%
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {session.date}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
