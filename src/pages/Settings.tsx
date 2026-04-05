import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Bell, Download, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const notifyReminders = (profile as any)?.notify_gift_reminders ?? true;
  const notifyCreditExpiry = (profile as any)?.notify_credit_expiry ?? true;
  const notifyTips = (profile as any)?.notify_tips ?? false;

  const updateNotif = useMutation({
    mutationFn: async (updates: Record<string, boolean>) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates as any)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Preferences saved");
    },
  });

  const handleDownloadData = async () => {
    try {
      const [profileRes, recipientsRes, sessionsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
        supabase.from("recipients").select("*").eq("user_id", user!.id),
        supabase.from("gift_sessions").select("*").eq("user_id", user!.id),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        profile: profileRes.data,
        recipients: recipientsRes.data,
        gift_sessions: sessionsRes.data,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `giftmind-data-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data downloaded!");
    } catch {
      toast.error("Failed to download data");
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    try {
      // Delete user data in order
      await supabase.from("gift_sessions").delete().eq("user_id", user!.id);
      await supabase.from("recipients").delete().eq("user_id", user!.id);
      await supabase.from("referrals").delete().eq("referrer_id", user!.id);
      await supabase.from("credit_transactions").delete().eq("user_id", user!.id);
      await supabase.from("profiles").delete().eq("user_id", user!.id);
      await signOut();
      navigate("/");
      toast.success("Account deleted");
    } catch {
      toast.error("Failed to delete account. Please contact support.");
    }
  };

  const isGoogleUser = user?.app_metadata?.provider === "google";

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg font-heading">Notification Preferences</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-reminders" className="text-sm cursor-pointer">
                Email me gift reminders for upcoming occasions
              </Label>
              <Switch
                id="notif-reminders"
                checked={notifyReminders}
                onCheckedChange={(v) => updateNotif.mutate({ notify_gift_reminders: v })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-credits" className="text-sm cursor-pointer">
                Email me when credits are about to expire
              </Label>
              <Switch
                id="notif-credits"
                checked={notifyCreditExpiry}
                onCheckedChange={(v) => updateNotif.mutate({ notify_credit_expiry: v })}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-tips" className="text-sm cursor-pointer">
                Email me GiftMind tips and updates
              </Label>
              <Switch
                id="notif-tips"
                checked={notifyTips}
                onCheckedChange={(v) => updateNotif.mutate({ notify_tips: v })}
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
                  Get a copy of all your data as JSON
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadData}>
                <Download className="w-4 h-4 mr-2" /> Download
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Delete my account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive/5"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-destructive">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will permanently delete:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Your profile and preferences</li>
                <li>All saved recipients</li>
                <li>Gift session history</li>
                <li>Credit balance (non-refundable)</li>
              </ul>
              <p className="font-semibold text-foreground pt-2">This action cannot be undone.</p>
              <div className="pt-3">
                <Label htmlFor="delete-confirm" className="text-sm">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="mt-1.5"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm("")}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "DELETE"}
              onClick={handleDeleteAccount}
            >
              Delete Everything
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Settings;
