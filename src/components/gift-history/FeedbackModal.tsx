import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

type GiftSession = Tables<"gift_sessions"> & {
  recipients?: Tables<"recipients"> | null;
};

const REACTIONS = [
  { value: "loved_it", emoji: "😍", label: "Loved it" },
  { value: "liked_it", emoji: "😊", label: "Liked it" },
  { value: "neutral", emoji: "😐", label: "Neutral" },
  { value: "didnt_like", emoji: "😕", label: "Didn't like" },
];

interface Props {
  session: GiftSession | null;
  onClose: () => void;
  onSubmit: (rating: string, notes: string) => void;
  isSubmitting: boolean;
}

const FeedbackModal = ({ session, onClose, onSubmit, isSubmitting }: Props) => {
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (session) {
      setRating("");
      setNotes("");
      setSubmitted(false);
      setShowConfetti(false);
    }
  }, [session]);

  const handleSubmit = () => {
    onSubmit(rating, notes);
    setSubmitted(true);
    if (rating === "loved_it") {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  const name = session?.recipients?.name || "them";

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {submitted ? "Thanks!" : `How did ${name} react?`}
          </DialogTitle>
          <DialogDescription>
            {submitted
              ? "This helps us recommend even better gifts."
              : "Your feedback helps improve future recommendations."}
          </DialogDescription>
        </DialogHeader>

        {/* Confetti */}
        <AnimatePresence>
          {showConfetti && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
              {Array.from({ length: 24 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: ["#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"][i % 5],
                    left: `${Math.random() * 100}%`,
                    top: "-10px",
                  }}
                  initial={{ y: 0, opacity: 1, rotate: 0 }}
                  animate={{
                    y: 400,
                    opacity: 0,
                    rotate: Math.random() * 360,
                    x: (Math.random() - 0.5) * 200,
                  }}
                  transition={{ duration: 1.5 + Math.random(), ease: "easeOut" }}
                />
              ))}
            </div>
          )}
        </AnimatePresence>

        {!submitted ? (
          <div className="space-y-4 pt-2">
            <div className="flex justify-center gap-3">
              {REACTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRating(r.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-center",
                    rating === r.value
                      ? "border-primary bg-primary/5 scale-110"
                      : "border-border hover:border-primary/30"
                  )}
                >
                  <span className="text-2xl">{r.emoji}</span>
                  <span className="text-[10px] font-medium text-foreground">{r.label}</span>
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Any notes for next time? (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />

            <Button
              className="w-full"
              disabled={!rating || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        ) : (
          <div className="text-center py-6">
            <span className="text-4xl">🎉</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackModal;
