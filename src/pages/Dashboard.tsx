import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Gift, LogOut } from "lucide-react";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const name = user?.user_metadata?.full_name || "Gifter";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Gift className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-heading font-bold text-foreground">GiftMind</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Hi, {name}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12 text-center">
        <h1 className="text-3xl font-heading font-bold text-foreground mb-4">Your Dashboard</h1>
        <p className="text-muted-foreground">Start finding the perfect gift — coming soon!</p>
      </main>
    </div>
  );
};

export default Dashboard;
