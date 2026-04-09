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

const CURRENCIES = [
  { value: "INR", label: "₹ INR" },
  { value: "USD", label: "$ USD" },
  { value: "GBP", label: "£ GBP" },
  { value: "EUR", label: "€ EUR" },
  { value: "AED", label: "د.إ AED" },
  { value: "CAD", label: "$ CAD" },
  { value: "AUD", label: "$ AUD" },
  { value: "SGD", label: "$ SGD" },
];

const getCurrencyForCountry = (c: string) => {
  const map: Record<string, string> = {
    IN: "INR", US: "USD", GB: "GBP", AE: "AED",
    FR: "EUR", DE: "EUR", IT: "EUR", ES: "EUR", NL: "EUR",
    CA: "CAD", AU: "AUD", SG: "SGD"
  };
  return map[c] || "USD";
};

const Profile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("IN");
  const [currencyPref, setCurrencyPref] = useState("INR");
  const [language, setLanguage] = useState("en");

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
      setCountry((profile as any).country || "IN");
      setCurrencyPref((profile as any).currency_preference || "INR");
      setLanguage((profile as any).language || "en");
    }
  }, [profile]);

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
      const { error } = await supabase
        .from("users")
        .update({
          full_name: fullName,
          country,
          currency_preference: currencyPref,
          language,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", user!.id);
      if (error) throw error;
      
      localStorage.setItem("gm_currency", currencyPref);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved!");
    },
    onError: () => toast.error("Failed to save profile"),
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

  const handleCountryChange = (val: string) => {
    setCountry(val);
    setCurrencyPref(getCurrencyForCountry(val));
  };
  
  const handleCurrencyChange = (val: string) => {
    setCurrencyPref(val);
    localStorage.setItem("gm_currency", val);
  };

  const referralCode = profile?.referral_code || user?.id?.slice(0, 8) || "XXXXXX";
  const referralLink = `https://giftmind.in/?ref=${referralCode}`;
  
  const totalReferred = referrals.length;
  const completedReferrals = referrals.filter((r) => r.status === "completed").length;
  const totalCreditsEarned = referrals.reduce((sum, r) => sum + (r.credits_awarded ? 3 : 0), 0);
  const remainingSlots = 10 - totalReferred;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappMsg = encodeURIComponent(
    `I found an amazing AI gifting tool! 🎁 It tells you exactly what to gift, why it works, and where to buy. Get 5 free credits (instead of 3): ${referralLink}`
  );

  const emailSubject = encodeURIComponent("Check out GiftMind — AI gift recommendations");
  const emailBody = encodeURIComponent(
    `Hey! I've been using GiftMind to find perfect gifts. It gives you AI-powered recommendations with confidence scores and tells you where to buy. You'll get 5 free credits to try: ${referralLink}`
  );

  const initials = (fullName || user?.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

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
                <p className="font-medium text-foreground">{fullName || "Your Name"}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            {/* Fields */}
            <div className="grid gap-4">
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
                  <Select value={country} onValueChange={handleCountryChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">This sets your default currency and store preferences.</p>
                </div>
                <div>
                  <Label>Display prices in</Label>
                  <Select value={currencyPref} onValueChange={handleCurrencyChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Auto-set from your country. Change if you prefer a different currency.</p>
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
                Invite {remainingSlots} more friends to earn up to {remainingSlots * 3} credits.
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
