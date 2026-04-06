import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, Shield, Bot, Lock, Globe } from "lucide-react";

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
  { icon: Bot, label: "AI by Claude" },
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
    <section className="py-24 bg-card">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-primary font-semibold mb-2">Social Proof</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Join <span className="text-primary">200+</span> early gifters
          </h2>
          <p className="text-muted-foreground text-lg">finding the perfect gift with confidence</p>
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
              className="flex-shrink-0 w-[300px] md:w-[340px] snap-center p-6 rounded-xl bg-background card-shadow"
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
            <div
              key={b.label}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-muted text-muted-foreground text-sm font-medium"
            >
              <b.icon className="w-4 h-4" />
              {b.label}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default SocialProof;
