import { Gift, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import PricingCards from "@/components/pricing/PricingCards";

export default function NoCreditGate() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-10">
      <div className="w-full max-w-5xl space-y-8 rounded-[28px] border border-border bg-card p-6 shadow-sm md:p-10">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            You&apos;ve used all your free credits
          </h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Unlock more AI gift sessions, more stores, and premium tools like Signal Check.
          </p>
        </div>

        <PricingCards highlightPlan="popular" compact />

        <div className="text-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
