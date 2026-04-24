import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Bell, Download, Trash2, Shield, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { normalizePlan } from "@/lib/plans";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type UserProfile = Tables<"users">;
type NotificationPrefs = {
  reminders?: boolean;
  feedback_reminders?: boolean;
  credit_expiry?: boolean;
  tips?: boolean;
};

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data: profile } = useQuery({
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

  const notificationPrefs =
    profile?.notification_prefs && typeof profile.notification_prefs === "object" && !Array.isArray(profile.notification_prefs)
      ? profile.notification_prefs as NotificationPrefs
      : null;
  const notifyReminders = notificationPrefs && "reminders" in notificationPrefs ? notificationPrefs.reminders !== false : true;
  const notifyFeedbackReminders =
    notificationPrefs && "feedback_reminders" in notificationPrefs
      ? notificationPrefs.feedback_reminders !== false
      : true;
  const notifyCreditExpiry = notificationPrefs && "credit_expiry" in notificationPrefs ? notificationPrefs.credit_expiry !== false : true;
  const notifyTips = notificationPrefs && "tips" in notificationPrefs ? Boolean(notificationPrefs.tips) : false;
  const normalizedPlan = normalizePlan(profile?.active_plan);
  const hasExportAccess = normalizedPlan === "gifting-pro";
  const hasOccasionReminderAccess = normalizedPlan === "confident" || normalizedPlan === "gifting-pro";

  const updateNotif = useMutation({
    mutationFn: async (updates: Record<string, boolean>) => {
      const nextPrefs: NotificationPrefs = {
        ...(notificationPrefs ?? {}),
        ...updates,
      };
      const { error } = await supabase
        .from("users")
        .update({
          notification_prefs: nextPrefs,
        } satisfies TablesUpdate<"users">)
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Preferences saved");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke("export-user-data", {
        body: {},
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data || response.data.error) {
        throw new Error(response.data?.error || "Failed to export user data");
      }

      return response.data;
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `giftmind-data-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data export is ready.");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Pro plan") || message.includes("Gifting Pro")) {
        toast.error("Data export is available on Gifting Pro plan");
        return;
      }
      toast.error("Failed to download data. Please try again.");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke("delete-account", {
        body: { confirmation: "DELETE" },
      });

      if (response.error) {
        throw response.error;
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Failed to delete account");
      }

      return response.data;
    },
    onSuccess: async () => {
      await supabase.auth.signOut({ scope: "local" });
      queryClient.clear();
      setDeleteOpen(false);
      setDeleteConfirm("");
      navigate("/", { replace: true });
      toast.success("Your account has been deleted. We're sorry to see you go.");
    },
    onError: () => {
      toast.error("Something went wrong. Please contact support.");
    },
  });

  const isGoogleUser = user?.app_metadata?.provider === "google";

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>

        {/* Notifications */}
        <Card id="notifications">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg font-heading">Notification Preferences</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notif-reminders" className="text-sm cursor-pointer">
                  Occasion reminders
                </Label>
                <p className="text-xs text-muted-foreground">
                  Get emailed 14, 3, and 1 day before saved occasions.
                  {!hasOccasionReminderAccess ? " Available on Confident and Gifting Pro." : ""}
                </p>
              </div>
              <Switch
                id="notif-reminders"
                checked={notifyReminders}
                disabled={!hasOccasionReminderAccess}
                onCheckedChange={(v) => updateNotif.mutate({ reminders: v })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notif-followups" className="text-sm cursor-pointer">
                  Gift follow-ups
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ask me how the gift was received after each occasion.
                </p>
              </div>
              <Switch
                id="notif-followups"
                checked={notifyFeedbackReminders}
                onCheckedChange={(v) => updateNotif.mutate({ feedback_reminders: v })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notif-credits" className="text-sm cursor-pointer">
                  Credit expiry warnings
                </Label>
                <p className="text-xs text-muted-foreground">
                  Notify me when my credits are about to expire.
                </p>
              </div>
              <Switch
                id="notif-credits"
                checked={notifyCreditExpiry}
                onCheckedChange={(v) => updateNotif.mutate({ credit_expiry: v })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <Label htmlFor="notif-tips" className="text-sm cursor-pointer">
                  Tips and updates
                </Label>
                <p className="text-xs text-muted-foreground">
                  Product news, gifting tips, and occasional updates from GiftMind.
                </p>
              </div>
              <Switch
                id="notif-tips"
                checked={notifyTips}
                onCheckedChange={(v) => updateNotif.mutate({ tips: v })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        {isGoogleUser && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg font-heading">Connected Accounts</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Google</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">Connected</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data & Privacy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-heading">Data & Privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Download my data</p>
                <p className="text-xs text-muted-foreground">
                  Get a copy of your personal data as JSON
                </p>
                {!hasExportAccess && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <Lock className="w-3 h-3 inline mr-1" />
                    Data export is available on Gifting Pro plan
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportMutation.mutate()}
                disabled={!hasExportAccess || exportMutation.isPending}
              >
                <Download className="w-4 h-4 mr-2" />
                {exportMutation.isPending ? "Preparing..." : hasExportAccess ? "Download" : "Pro only"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-destructive/20 border-l-4 border-l-destructive bg-[#FFF5F5] p-6 space-y-5">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-heading font-semibold">Danger Zone</h2>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Delete your account</p>
            <p className="text-sm text-muted-foreground">
              This permanently deletes your account and all associated data including:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>Your profile and preferences</li>
              <li>All saved recipients and their details</li>
              <li>Gift session history and AI recommendations</li>
              <li>Credit balance (non-refundable)</li>
              <li>Referral history</li>
            </ul>
            <p className="text-sm font-medium text-foreground pt-1">This action cannot be undone.</p>
          </div>

          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/5"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete My Account
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-destructive">
              ⚠️ Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This will permanently delete:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Your profile and all personal data</li>
                  <li>All saved recipients</li>
                  <li>Gift history and recommendations</li>
                  <li>All remaining credits (non-refundable)</li>
                  <li>Your referral link and history</li>
                </ul>
                <div className="pt-3">
                  <Label htmlFor="delete-confirm" className="text-sm">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm:
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteConfirm("");
                setDeleteOpen(false);
              }}
              disabled={deleteAccountMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "DELETE" || deleteAccountMutation.isPending}
              onClick={() => deleteAccountMutation.mutate()}
            >
              {deleteAccountMutation.isPending ? "Deleting your data..." : "Delete Everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Settings;
