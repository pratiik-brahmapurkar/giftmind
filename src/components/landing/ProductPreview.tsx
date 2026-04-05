import { motion } from "framer-motion";

const ProductPreview = () => {
  return (
    <section className="py-24" style={{ backgroundColor: "#F8F7FF" }}>
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            See what <span className="text-primary">confident gifting</span> looks like
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Here's a real GiftMind recommendation for "Anniversary gift for wife, ₹2,000–5,000 budget"
          </p>
        </motion.div>

        <motion.div
          className="max-w-[520px] mx-auto"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          style={{ transform: "rotate3d(-1, 1, 0, 3deg)" }}
        >
          <div
            className="rounded-2xl bg-card p-6 md:p-8"
            style={{
              borderLeft: "3px solid transparent",
              borderImage: "linear-gradient(135deg, hsl(249 76% 64%), hsl(0 100% 70%)) 1",
              boxShadow: "0 12px 40px rgba(108,92,231,0.12), 0 2px 12px rgba(0,0,0,0.06)",
            }}
          >
            {/* Confidence badge */}
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4"
              style={{ backgroundColor: "hsl(168 100% 36% / 0.12)", color: "hsl(168 100% 36%)" }}
            >
              🎯 92% Confidence
            </span>

            <h3 className="text-xl font-bold text-foreground mb-2">
              Personalized Star Map of Your First Date Night
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed mb-5">
              A custom star map showing exactly how the sky looked on the night you first met — framed, with your names and date engraved.
            </p>

            <hr className="border-border mb-5" />

            {/* Why it works */}
            <div className="pl-4 mb-5" style={{ borderLeft: "3px solid hsl(249 76% 64%)" }}>
              <p className="text-xs font-semibold text-primary mb-1">Why it works</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your wife values sentimental gestures over luxury items. This combines personalization (your specific date) with visual beauty (wall art) — a gift that says "I remember everything."
              </p>
            </div>

            <hr className="border-border mb-5" />

            {/* Signal check */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground mb-1">💬 What this gift communicates:</p>
              <p className="text-sm italic leading-relaxed" style={{ color: "hsl(var(--accent))" }}>
                "I pay attention to our history. I chose something uniquely about us — not generic. I value meaning over price."
              </p>
            </div>

            <hr className="border-border mb-4" />

            {/* Price & availability */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">₹1,500 – ₹3,000</span>
              <span className="text-xs text-muted-foreground">Available on Amazon, Etsy & more</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ProductPreview;
