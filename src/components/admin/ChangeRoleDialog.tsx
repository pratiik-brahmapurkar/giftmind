import { useEffect, useState } from "react";
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
import { useMyAdminRole } from "@/hooks/useMyAdminRole";
import { canDo } from "@/lib/adminPermissions";
import { logAdminAction } from "@/lib/adminAudit";
import { useAuth } from "@/contexts/AuthContext";

type UserRolesMutationBuilder = {
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: Error | null }>;
  };
  insert: (value: Record<string, unknown>) => Promise<{ error: Error | null }>;
};

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
  const { role: callerRole } = useMyAdminRole();
  const { user } = useAuth();
  const canChangeRole = canDo(callerRole, "users.change_role");

  useEffect(() => {
    if (open) setNewRole(currentRole);
  }, [currentRole, open]);

  const handleChange = async () => {
    if (!userId || newRole === currentRole) { onClose(); return; }
    if (!canChangeRole) {
      toast.error("Requires SuperAdmin access");
      return;
    }
    setLoading(true);
    try {
      const userRoles = supabase.from("user_roles" as never) as unknown as UserRolesMutationBuilder;
      // Delete existing role
      await userRoles.delete().eq("user_id", userId);

      // Insert new role if not plain user
      if (newRole !== "user") {
        const { error } = await userRoles.insert({
          user_id: userId,
          role: newRole,
          granted_by: user?.id,
        });
        if (error) throw error;
      }

      await logAdminAction({
        action: "change_role",
        targetType: "user",
        targetId: userId,
        payload: { before: currentRole, after: newRole },
      });
      toast.success(`Role changed to ${newRole}`);
      onSuccess();
    } catch (err: unknown) {
      captureError(
        err instanceof Error ? err : new Error("Failed to change user role"),
        { action: "admin-change-user-role", target_user_id: userId, new_role: newRole },
      );
      toast.error(err instanceof Error ? err.message : "Failed to change role");
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
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              {callerRole === "superadmin" && <SelectItem value="superadmin">SuperAdmin</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleChange} disabled={loading || !canChangeRole}>
            {loading ? "Saving..." : "Confirm Change"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ChangeRoleDialog;
