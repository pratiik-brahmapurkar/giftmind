import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { captureError } from "@/lib/sentry";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ChangeRoleDialogProps {
  userId: string | null;
  currentRole: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ChangeRoleDialog = ({ userId, currentRole, open, onClose, onSuccess }: ChangeRoleDialogProps) => {
  const [newRole, setNewRole] = useState<string>(currentRole);
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (!userId || newRole === currentRole) { onClose(); return; }
    setLoading(true);
    try {
      // Delete existing role
      await supabase.from("user_roles").delete().eq("user_id", userId);

      // Insert new role if not plain user
      if (newRole !== "user") {
        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: newRole as AppRole,
        });
        if (error) throw error;
      }

      toast.success(`Role changed to ${newRole}`);
      onSuccess();
    } catch (err: any) {
      captureError(
        err instanceof Error ? err : new Error("Failed to change user role"),
        { action: "admin-change-user-role", target_user_id: userId, new_role: newRole },
      );
      toast.error(err.message || "Failed to change role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change User Role</AlertDialogTitle>
          <AlertDialogDescription>
            This will change the user's access level on the platform. Current role: <strong>{currentRole}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label>New Role</Label>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="superadmin">SuperAdmin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleChange} disabled={loading}>
            {loading ? "Saving..." : "Confirm Change"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ChangeRoleDialog;
