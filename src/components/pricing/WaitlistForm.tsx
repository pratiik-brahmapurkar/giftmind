import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { invokeAuthedFunction } from "@/hooks/giftSessionShared";
import { trackEvent } from "@/lib/posthog";

type PriceFeedback = "yes_599" | "maybe_different_price" | "no";

interface WaitlistResponse {
  success: boolean;
  position: number;
  already_joined: boolean;
  email?: string;
}

interface WaitlistFormProps {
  source: string;
  compact?: boolean;
  onJoined?: (result: WaitlistResponse) => void;
}

export function WaitlistForm({ source, compact = false, onJoined }: WaitlistFormProps) {
  const [priceFeedback, setPriceFeedback] = useState<PriceFeedback>("yes_599");
  const [preferredPrice, setPreferredPrice] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      return invokeAuthedFunction<WaitlistResponse>("join-waitlist", {
        source,
        price_feedback: priceFeedback,
        preferred_price: priceFeedback === "maybe_different_price" && preferredPrice ? Number(preferredPrice) : undefined,
      });
    },
    onSuccess: (result) => {
      trackEvent(result.already_joined ? "pro_waitlist_already_joined" : "pro_waitlist_joined", {
        source,
        price_feedback: priceFeedback,
        position: result.position,
      });
      onJoined?.(result);
    },
  });

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <RadioGroup value={priceFeedback} onValueChange={(value) => setPriceFeedback(value as PriceFeedback)} className="space-y-2">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="yes_599" id={`${source}-yes`} />
          <Label htmlFor={`${source}-yes`}>Yes, $5.99/month works for me</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="maybe_different_price" id={`${source}-maybe`} />
          <Label htmlFor={`${source}-maybe`}>Maybe at a different price</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="no" id={`${source}-no`} />
          <Label htmlFor={`${source}-no`}>Not likely</Label>
        </div>
      </RadioGroup>

      {priceFeedback === "maybe_different_price" ? (
        <Input
          type="number"
          min="1"
          step="0.5"
          inputMode="decimal"
          value={preferredPrice}
          onChange={(event) => setPreferredPrice(event.target.value)}
          placeholder="Preferred monthly price"
        />
      ) : null}

      {mutation.isError ? (
        <p className="text-sm text-destructive">Could not join the waitlist. Please try again.</p>
      ) : null}

      <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        Join Pro Waitlist
      </Button>
    </div>
  );
}
