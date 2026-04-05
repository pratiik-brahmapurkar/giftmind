import { motion } from "framer-motion";
import { Star, Shield, Bot, Lock } from "lucide-react";

const testimonials = [
  {
    name: "Priya S.",
    role: "Beta Tester",
    text: "Found the perfect anniversary gift in 45 seconds. My husband was genuinely surprised — that never happens!",
    rating: 5,
  },
  {
    name: "Arjun M.",
    role: "Early Adopter",
    text: "The confidence score is genius. I finally stopped second-guessing my Diwali gifts for my in-laws.",
    rating: 5,
  },
  {
    name: "Sarah K.",
    role: "Beta Tester",
    text: "I used to spend hours on gift lists. GiftMind gave me 3 perfect options with reasons. Game changer.",
    rating: 5,
  },
];

const badges = [
  { icon: Bot, label: "AI by Claude" },
  { icon: Lock, label: "Data stays private" },
  { icon: Shield, label: "No spam" },
];

const SocialProof = () => {
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

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              className="p-6 rounded-xl bg-background card-shadow hover:card-shadow-hover transition-shadow duration-300"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <div className="flex gap-1 mb-4">
                {[...Array(t.rating)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-foreground mb-4 leading-relaxed">"{t.text}"</p>
              <div>
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-muted-foreground text-xs">{t.role}</p>
              </div>
            </motion.div>
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
