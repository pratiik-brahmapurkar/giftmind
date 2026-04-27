import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, Shield, Bot, Lock, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const testimonials = [
  {
    text: "Found the perfect anniversary gift in 90 seconds. My husband was genuinely surprised — that never happens.",
    name: "Priya S.",
    location: "🇮🇳 Mumbai",
    rating: 5,
  },
  {
    text: "The confidence scores are genius. I finally stopped second-guessing my Diwali gifts for my in-laws.",
    name: "Arjun M.",
    location: "🇮🇳 Delhi",
    rating: 5,
  },
  {
    text: "I used to spend hours on gift lists. GiftMind gave me 3 perfect options with reasons. Game changer.",
    name: "Sarah K.",
    location: "🇺🇸 New York",
    rating: 5,
  },
  {
    text: "Perfect for Christmas shopping. Found gifts for my whole family in one sitting. The Signal Check feature is brilliant.",
    name: "James R.",
    location: "🇬🇧 London",
    rating: 5,
  },
  {
    text: "Finally something that understands Eid gifting etiquette. The cultural notes saved me from an awkward mistake.",
    name: "Fatima A.",
    location: "🇦🇪 Dubai",
    rating: 5,
  },
];

const badges = [
  { icon: Bot, label: "AI-assisted picks" },
  { icon: Lock, label: "Data stays private" },
  { icon: Globe, label: "Works in 50+ countries" },
  { icon: Shield, label: "No spam" },
];

const SocialProof = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPaused = useRef(false);

  const scrollToIndex = useCallback((idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[idx] as HTMLElement | undefined;
    if (card) {
      el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
    }
  }, []);

  // Auto-advance every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPaused.current) return;
      setCurrentIndex((prev) => {
        const next = (prev + 1) % testimonials.length;
        scrollToIndex(next);
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [scrollToIndex]);

  // Sync scroll position to index via IntersectionObserver
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.idx);
            if (!isNaN(idx)) setCurrentIndex(idx);
          }
        });
      },
      { root: el, threshold: 0.6 }
    );
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
    <section className="bg-card py-20 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="mb-2 font-semibold text-primary">Early users</p>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Less second-guessing, better gifting
          </h2>
          <p className="text-lg text-muted-foreground">A few ways GiftMind is already helping people choose faster.</p>
        </motion.div>

        {/* Horizontal scroll carousel */}
        <div
          ref={scrollRef}
          onMouseEnter={() => (isPaused.current = true)}
          onMouseLeave={() => (isPaused.current = false)}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-hide max-w-5xl mx-auto mb-6"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              data-idx={i}
              className="w-[300px] flex-shrink-0 snap-center rounded-xl border border-border/60 bg-background p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-200 hover:shadow-lg md:w-[340px]"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="flex gap-1 mb-4">
                {[...Array(t.rating)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-foreground mb-4 leading-relaxed text-sm italic">"{t.text}"</p>
              <div>
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-muted-foreground text-xs">{t.location}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mb-16">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrentIndex(i); scrollToIndex(i); }}
              className={`w-2 h-2 rounded-full transition-colors ${i === currentIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>

        <motion.div
          className="flex flex-wrap justify-center gap-6"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          {badges.map((b) => (
            <Tooltip key={b.label}>
              <TooltipTrigger asChild>
                <div className="flex cursor-help items-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-amber-50 hover:text-amber-900">
                  <b.icon className="w-4 h-4" />
                  {b.label}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {b.label === "Data stays private"
                  ? "Recipient details stay in your account and can be deleted from Settings."
                  : b.label === "Works in 50+ countries"
                    ? "GiftMind can adapt recommendations and store links by recipient country."
                    : b.label === "No spam"
                      ? "We use email for product and account updates, not noisy promotions."
                      : "AI helps rank and explain options; you still choose the final gift."}
              </TooltipContent>
            </Tooltip>
          ))}
        </motion.div>
      </div>
    </section>
    </TooltipProvider>
  );
};

export default SocialProof;
