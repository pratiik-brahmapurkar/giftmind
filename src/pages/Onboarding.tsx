import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import AuthLayout from "@/components/AuthLayout";

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = user?.user_metadata?.full_name || "there";

  return (
    <AuthLayout>
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-heading">Welcome, {name}! 🎁</CardTitle>
          <CardDescription>Let's set up your gifting profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">Your account is ready. You have 3 free credits to get started.</p>
          <Button variant="hero" className="w-full" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  );
};

export default Onboarding;
