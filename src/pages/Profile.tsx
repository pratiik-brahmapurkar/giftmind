import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PlanBadge } from "@/components/common/PlanBadge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Camera, Copy, Check, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { COUNTRY_OPTIONS } from "@/components/recipients/constants";
import { AUDIENCE_OPTIONS, GIFT_STYLE_OPTIONS } from "@/features/onboarding/constants";
import {
  birthdayToIso,
  calculateProfileCompletion,
  getProfileCompletionMissingFields,
  parseBirthdayString,
  parseOnboardingState,
  validateBirthdayDraft,
} from "@/features/onboarding/utils";
import { trackEvent } from "@/lib/posthog";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type UserProfile = Tables<"users">;

const Profile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("US");
  const [language, setLanguage] = useState("en");
  const [birthday, setBirthday] = useState({ month: "", day: "", year: "" });
  const [audience, setAudience] = useState<string[]>([]);
  const [giftStyle, setGiftStyle] = useState<string[]>([]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCountry(profile.country || "US");
      setLanguage(profile.language || "en");
      setBirthday(parseBirthdayString(profile.birthday));
      const onboardingState = parseOnboardingState(profile.onboarding_state);
      setAudience(onboardingState.audience);
      setGiftStyle(onboardingState.gift_style);
    }
  }, [profile]);

  const { data: recipientCount = 0 } = useQuery({
    queryKey: ["profile-recipient-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("recipients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["referrals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("id, referred_id, status, created_at, credits_awarded")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const birthdayError = validateBirthdayDraft(birthday);
      if (birthdayError) throw new Error(birthdayError);

      const completionBefore = profile?.profile_completion_percentage ?? 0;
      const fieldsChanged: string[] = [];
      if ((profile?.full_name || "") !== fullName) fieldsChanged.push("full_name");
      if ((profile?.country || "US") !== country) fieldsChanged.push("country");
      if ((profile?.language || "en") !== language) fieldsChanged.push("language");
      if ((profile?.birthday || null) !== birthdayToIso(birthday)) fieldsChanged.push("birthday");

      const currentOnboardingState = parseOnboardingState(profile?.onboarding_state);
      if (JSON.stringify(currentOnboardingState.audience) !== JSON.stringify(audience)) fieldsChanged.push("audience");
      if (JSON.stringify(currentOnboardingState.gift_style) !== JSON.stringify(giftStyle)) fieldsChanged.push("gift_style");

      const { error } = await supabase
        .from("users")
        .update({
          full_name: fullName,
          country,
          birthday: birthdayToIso(birthday),
          language,
          onboarding_state: {
            ...currentOnboardingState,
            audience,
            gift_style: giftStyle,
          },
          updated_at: new Date().toISOString(),
        } satisfies TablesUpdate<"users">)
        .eq("id", user!.id);
      if (error) throw error;

      const completionAfter = calculateProfileCompletion({
        fullName,
        country,
        recipientCount,
        birthday: birthdayToIso(birthday),
        audience,
        giftStyle,
      });
      trackEvent("profile_updated", {
        fields_changed: fieldsChanged,
        completion_before: completionBefore,
        completion_after: completionAfter,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-profile"] });
      toast.success("Profile saved!");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to save profile"),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop();
      const path = `${user!.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user!.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Avatar updated!");
    },
    onError: () => toast.error("Failed to upload avatar"),
  });

  const referralCode = profile?.referral_code || user?.id?.slice(0, 8) || "XXXXXX";
  const referralLink = `https://giftmind.in/?ref=${referralCode}`;
  
  const totalReferred = referrals.length;
  const completedReferrals = referrals.filter((r) => r.status === "completed").length;
  const totalCreditsEarned = referrals.reduce((sum, r) => sum + (r.credits_awarded ? 1 : 0), 0);
  const remainingSlots = 10 - totalReferred;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappMsg = encodeURIComponent(
    `I found an AI gifting tool that gives thoughtful recommendations. Try it here: ${referralLink}`
  );

  const emailSubject = encodeURIComponent("Check out GiftMind — AI gift recommendations");
  const emailBody = encodeURIComponent(
    `Hey! I've been using GiftMind to find perfect gifts. It gives you AI-powered recommendations with confidence scores and tells you where to buy: ${referralLink}`
  );

  const initials = (fullName || user?.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const completionPercentage = calculateProfileCompletion({
    fullName,
    country,
    recipientCount,
    birthday: birthdayToIso(birthday),
    audience,
    giftStyle,
  });
  const missingFields = getProfileCompletionMissingFields({
    fullName,
    country,
    recipientCount,
    birthday: birthdayToIso(birthday),
    audience,
    giftStyle,
  });

  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label: new Date(2000, index, 1).toLocaleString("en-US", { month: "short" }),
  }));
  const dayOptions = Array.from({ length: 31 }, (_, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label: String(index + 1),
  }));
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 108 }, (_, index) => String(currentYear - 13 - index));

  if (isLoading) return <DashboardLayout><div className="animate-pulse p-8" /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Profile</h1>

        {/* Avatar + Fields */}
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload profile photo"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  aria-label="Select profile photo"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAvatar.mutate(file);
                  }}
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{fullName || "Your Name"}</p>
                  <PlanBadge plan={profile?.active_plan} />
                </div>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            {/* Fields */}
            <div className="grid gap-4">
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Profile Completion</p>
                    <p className="text-xs text-muted-foreground">
                      {missingFields.length > 0 ? `Complete: ${missingFields.slice(0, 2).join(" · ")}` : "All core details are filled in."}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{completionPercentage}%</span>
                </div>
                <Progress value={completionPercentage} className="h-2 bg-muted [&>div]:bg-primary" aria-label="Profile completion" />
              </div>

              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ""} disabled className="bg-muted text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Where do you live?</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">This helps match store links for your region.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Birthday</Label>
                <div className="grid grid-cols-3 gap-3">
                  <Select value={birthday.month || "__empty"} onValueChange={(value) => setBirthday((prev) => ({ ...prev, month: value === "__empty" ? "" : value }))}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty">Month</SelectItem>
                      {monthOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={birthday.day || "__empty"} onValueChange={(value) => setBirthday((prev) => ({ ...prev, day: value === "__empty" ? "" : value }))}>
                    <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty">Day</SelectItem>
                      {dayOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={birthday.year || "__empty"} onValueChange={(value) => setBirthday((prev) => ({ ...prev, year: value === "__empty" ? "" : value }))}>
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty">Year</SelectItem>
                      {yearOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground">Optional. Used for birthday reminders later.</p>
              </div>
              <div className="space-y-2">
                <Label>Who you gift for</Label>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCE_OPTIONS.map((option) => {
                    const active = audience.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/40",
                        )}
                        onClick={() => setAudience((prev) => prev.includes(option.value) ? prev.filter((item) => item !== option.value) : [...prev, option.value])}
                      >
                        {option.emoji} {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Gift style</Label>
                <div className="flex flex-wrap gap-2">
                  {GIFT_STYLE_OPTIONS.map((option) => {
                    const active = giftStyle.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/40",
                        )}
                        onClick={() => setGiftStyle((prev) => {
                          if (prev.includes(option.value)) return prev.filter((item) => item !== option.value);
                          if (prev.length >= 3) return prev;
                          return [...prev, option.value];
                        })}
                      >
                        {option.emoji} {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi" disabled>Hindi (coming soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Referral */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-heading">Invite friends, earn credits</CardTitle>
            <CardDescription>
              Share your referral link and earn 3 credits for each friend who signs up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Link */}
            <div className="flex gap-2">
              <Input value={referralLink} readOnly className="font-mono text-sm bg-muted" />
              <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy referral link">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            {/* Share buttons */}
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-primary-foreground"
                asChild
              >
                <a
                  href={`https://wa.me/?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Share2 className="w-4 h-4 mr-2" /> WhatsApp
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`mailto:?subject=${emailSubject}&body=${emailBody}`}>
                  <Mail className="w-4 h-4 mr-2" /> Email
                </a>
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-2" /> Copy Link
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Friends invited: {totalReferred}/10</p>
                <Progress value={(totalReferred / 10) * 100} className="h-2" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rewards earned: {totalCreditsEarned} credits</p>
              </div>
            </div>
            {remainingSlots > 0 ? (
              <p className="text-sm text-muted-foreground">
                Invite {remainingSlots} more friends to earn up to {remainingSlots} credits.
              </p>
            ) : (
              <p className="text-sm font-medium text-emerald-600">
                Maximum referrals reached! Thank you for spreading the word.
              </p>
            )}

            {/* Referral table */}
            {referrals.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Friend</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referrals.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">
                          Friend #{referrals.length - i}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              r.status === "completed"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : "bg-amber-100 text-amber-700 border-amber-200"
                            )}
                          >
                            {r.status === "completed" ? "Completed" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No referrals yet. Share your link to earn bonus credits!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
