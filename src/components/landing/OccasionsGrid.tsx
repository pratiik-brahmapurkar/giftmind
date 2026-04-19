import { motion } from "framer-motion";

const occasions = [
  { emoji: "🎂", name: "Birthdays" },
  { emoji: "💍", name: "Anniversaries" },
  { emoji: "🪔", name: "Diwali" },
  { emoji: "🎄", name: "Christmas" },
  { emoji: "🌙", name: "Eid" },
  { emoji: "❤️", name: "Valentine's Day" },
  { emoji: "💒", name: "Weddings" },
  { emoji: "🍼", name: "Baby Showers" },
  { emoji: "🏠", name: "Housewarming" },
  { emoji: "🎓", name: "Graduations" },
  { emoji: "🎅", name: "Secret Santa" },
  { emoji: "🪢", name: "Raksha Bandhan" },
  { emoji: "🙏", name: "Thank You" },
  { emoji: "💝", name: "Just Because" },
  { emoji: "👔", name: "Corporate" },
];

const OccasionsGrid = () => {
  return (
    <section className="bg-[#F2EDE4] py-24">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            Every occasion. Every relationship. <span className="text-primary">Covered.</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From birthdays to Diwali, new romance to your boss's retirement — GiftMind knows the rules.
          </p>
        </motion.div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 max-w-4xl mx-auto mb-6">
          {occasions.map((o, i) => (
            <motion.div
              key={o.name}
              className="flex items-center gap-2 px-4 py-3 rounded-lg bg-card cursor-default select-none transition-all duration-200 hover:shadow-md hover:scale-[1.03]"
              style={{ "--tw-shadow-color": "hsl(var(--primary) / 0.08)" } as React.CSSProperties}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              whileHover={{ backgroundColor: "rgba(212, 160, 74, 0.08)" }}
            >
              <span className="text-xl md:text-2xl">{o.emoji}</span>
              <span className="text-sm font-medium text-foreground truncate">{o.name}</span>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-muted-foreground text-sm">+ 20 more occasions and counting</p>
      </div>
    </section>
  );
};

export default OccasionsGrid;
