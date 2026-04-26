import { useState } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";

interface DisableAccountDialogProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DisableAccountDialog = ({ userId, open, onClose, onSuccess }: DisableAccountDialogProps) => {
  const [loading, setLoading] = useState(false);

  const handleDisable = async () => {
    if (!userId) return;
    setLoading(true);
    // Note: actual user disabling requires a Supabase edge function with service role key
    // For now we show a toast indicating this feature needs backend implementation
    await logAdminAction({
      action: "disable_account",
      targetType: "user",
      targetId: userId,
      payload: { status: "requested", implemented: false },
    });
    toast.info("Account disabling requires a backend function. This will be implemented with an edge function.");
    setLoading(false);
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disable Account</AlertDialogTitle>
          <AlertDialogDescription>
            This will prevent the user from logging in. Are you sure you want to disable this account?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDisable}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Disabling..." : "Disable Account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DisableAccountDialog;
