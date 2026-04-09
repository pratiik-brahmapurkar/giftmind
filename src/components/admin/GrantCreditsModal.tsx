import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { captureError } from "@/lib/sentry";

interface GrantCreditsModalProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const reasons = ["Beta tester", "Compensation", "Promotion", "Manual"];

const GrantCreditsModal = ({ userId, open, onClose, onSuccess }: GrantCreditsModalProps) => {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    if (!userId || !amount || Number(amount) <= 0) {
      toast.error("Enter a valid credit amount");
      return;
    }
    setLoading(true);
    try {
      const response = await supabase.functions.invoke("admin-grant-credits", {
        body: {
          target_user_id: userId,
          amount: Number(amount),
          reason,
          notes: customReason,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.error?.message || response.data?.error || "Failed to grant credits");
      }

      toast.success(`Granted ${amount} credits`);
      setAmount(""); setReason(""); setCustomReason("");
      onSuccess();
    } catch (err: any) {
      captureError(
        err instanceof Error ? err : new Error("Failed to grant credits"),
        { action: "admin-grant-credits", target_user_id: userId },
      );
      toast.error(err.message || "Failed to grant credits");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Credits</DialogTitle>
          <DialogDescription>Add credits to this user's account</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Amount</Label>
            <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 10" />
          </div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Additional context..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGrant} disabled={loading}>
            {loading ? "Granting..." : "Grant Credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GrantCreditsModal;
