import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/posthog";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rateLimiter";
import { captureError } from "@/lib/sentry";
import { sanitizeString, validateEmail } from "@/lib/validation";

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

  const [referralCode, setReferralCode] = useState(() => {
    return sessionStorage.getItem("gm_referral_code") || refFromUrl;
  });
  const [showReferral, setShowReferral] = useState(!!referralCode);
  const isReferred = !!referralCode;

  // Persist referral code from URL
  useEffect(() => {
    if (refFromUrl) {
      setReferralCode(refFromUrl);
      setShowReferral(true);
      sessionStorage.setItem("gm_referral_code", refFromUrl);
    }
  }, [refFromUrl]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    const cleanEmail = sanitizeString(email, 320).toLowerCase();

    if (!agreed) { setError("You must agree to the Privacy Policy and Terms of Service."); return; }
    if (!validateEmail(cleanEmail)) { setError("Enter a valid email address."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); triggerShake(); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); triggerShake(); return; }

    setLoading(true);
    const { error: signupError } = await supabase.auth.signUp({
      email: cleanEmail,
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
      trackEvent('user_signup', { 
        method: 'email',
        has_referral: !!referralCode 
      });
      // If a referral code was provided, process it via the edge function.
      // This is non-blocking — a referral failure won't prevent onboarding.
      if (referralCode?.trim()) {
        try {
          // Wait briefly for the session to be available after signup
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const limit = checkRateLimit({
              key: "referral_process",
              maxRequests: 3,
              windowMs: 3_600_000,
            });

            if (!limit.allowed) {
              toast.error(RATE_LIMIT_MESSAGE);
            } else {
              const response = await supabase.functions.invoke("process-referral", {
                body: { referral_code: referralCode.trim() },
              });

              if (response.error || response.data?.error === "RATE_LIMITED") {
                toast.error(RATE_LIMIT_MESSAGE);
              } else {
                sessionStorage.removeItem("gm_referral_code");
                toast.success("🎉 Bonus credits added!");
              }
            }
          }
        } catch (e) {
          // Don't block signup if referral processing fails
          console.log("Referral processing (non-blocking):", e);
          captureError(
            e instanceof Error ? e : new Error("Referral processing failed"),
            { action: "process-referral", stage: "signup" },
          );
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

    trackEvent('user_signup', { method: 'google', has_referral: !!referralCode });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      setError(error.message || "Google sign-up failed");
      triggerShake();
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

          {isReferred && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
              <p className="text-sm font-medium text-primary">
                🎉 You were referred! Sign up to get 5 free credits instead of 3.
              </p>
            </div>
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
                    onChange={(e) => {
                      setReferralCode(e.target.value);
                      if (e.target.value) {
                        sessionStorage.setItem("gm_referral_code", e.target.value);
                      } else {
                        sessionStorage.removeItem("gm_referral_code");
                      }
                    }}
                    readOnly={!!refFromUrl}
                    className={cn(referralCode.length >= 4 ? "pr-8 border-success" : "", !!refFromUrl && "bg-muted cursor-not-allowed")} />
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
