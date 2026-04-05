import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import confetti from "canvas-confetti";

/* ── Password strength ── */
function getStrength(pw: string): { level: number; label: string; color: string } {
  if (!pw) return { level: 0, label: "", color: "bg-border" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return { level: 25, label: "Weak", color: "bg-destructive" };
  if (score === 2) return { level: 50, label: "Fair", color: "bg-warning" };
  if (score === 3) return { level: 75, label: "Good", color: "bg-warning" };
  return { level: 100, label: "Strong", color: "bg-success" };
}

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refFromUrl = searchParams.get("ref") || "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState(refFromUrl);
  const [showReferral, setShowReferral] = useState(!!refFromUrl);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const strength = useMemo(() => getStrength(password), [password]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const fireConfetti = () => {
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailError("");

    if (!agreed) { setError("You must agree to the Privacy Policy and Terms of Service."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); triggerShake(); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); triggerShake(); return; }

    setLoading(true);
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, referral_code: referralCode || undefined },
        emailRedirectTo: window.location.origin,
      },
    });

    if (signupError) {
      if (signupError.message?.toLowerCase().includes("already")) {
        setEmailError("already_exists");
      } else {
        setError(signupError.message);
      }
      setLoading(false);
      triggerShake();
    } else {
      if (referralCode) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("profiles").update({ referral_code: referralCode }).eq("user_id", user.id);
        }
      }
      fireConfetti();
      setTimeout(() => navigate("/onboarding"), 2000);
    }
  };

  const handleGoogleSignup = async () => {
    setError("");
    setEmailError("");
    if (!agreed) { setError("You must agree to the Privacy Policy and Terms of Service."); return; }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message || "Google sign-up failed");
      triggerShake();
    }
    if (!result.redirected && !result.error) {
      fireConfetti();
      setTimeout(() => navigate("/onboarding"), 2000);
    }
  };

  return (
    <AuthLayout>
      <Card className={`border-border/50 shadow-lg transition-transform ${shake ? "animate-shake" : ""}`}>
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-heading">Create your account</CardTitle>
          <CardDescription>Start gifting with confidence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Google OAuth */}
          <Button variant="outline" className="w-full" onClick={handleGoogleSignup}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-card px-3">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>

            {/* Email with inline error */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }} required
                className={emailError ? "border-destructive" : ""}
              />
              {emailError === "already_exists" && (
                <p className="text-xs text-destructive">
                  This email is already registered.{" "}
                  <Link to="/login" className="text-primary font-medium hover:underline">Log in instead</Link>
                </p>
              )}
            </div>

            {/* Password with strength indicator */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {password && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${strength.level}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-12">{strength.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">8+ characters with a number or symbol</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>

            {/* Referral code — toggle or auto-shown from URL */}
            {!showReferral ? (
              <button type="button" onClick={() => setShowReferral(true)}
                className="text-xs text-primary hover:underline">
                Have a referral code?
              </button>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="referral">Referral Code</Label>
                <div className="relative">
                  <Input id="referral" placeholder="e.g. abc123" value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className={referralCode.length >= 4 ? "pr-8 border-success" : ""} />
                  {referralCode.length >= 4 && (
                    <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-success animate-in zoom-in-50" />
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Checkbox id="terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug">
                I agree to the{" "}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>
                {" "}and{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</a>
              </label>
            </div>

            <Button type="submit" variant="hero" className="w-full" disabled={loading || !agreed}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
};

export default Signup;
