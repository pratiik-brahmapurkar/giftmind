import { CheckCircle2 } from "lucide-react";

interface WaitlistConfirmationProps {
  position: number;
  email?: string | null;
  alreadyJoined?: boolean;
}

export function WaitlistConfirmation({ position, email, alreadyJoined = false }: WaitlistConfirmationProps) {
  return (
    <div className="rounded-lg border border-success/20 bg-success/10 p-4 text-sm">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            {alreadyJoined ? "You're already on the list." : "You're on the list."}
          </p>
          <p className="text-muted-foreground">
            #{position} in line for Pro{email ? ` at ${email}` : ""}. We will email you when it is ready.
          </p>
        </div>
      </div>
    </div>
  );
}
