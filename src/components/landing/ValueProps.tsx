import { motion } from "framer-motion";
import { Clock, Target, Globe } from "lucide-react";

const props = [
  {
    icon: Clock,
    title: "Saves Hours",
    description: "No more browsing 50 tabs. Get curated, confident picks in under a minute.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Target,
    title: "Builds Confidence",
    description: "Know WHY this gift is right. Every recommendation comes with a reasoning score.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: Globe,
    title: "Culturally Smart",
    description: "Diwali, Eid, Christmas — we know the rules, traditions, and what truly resonates.",
    color: "bg-success/10 text-success",
  },
];

const ValueProps = () => {
  return (
    <section className="py-24 gradient-mesh">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Why <span className="text-primary">GiftMind</span>?
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            We don't just suggest gifts. We give you the confidence to gift.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {props.map((prop, i) => (
            <motion.div
              key={prop.title}
              className="p-8 rounded-xl bg-card card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1 text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <div className={`w-14 h-14 rounded-2xl ${prop.color} flex items-center justify-center mx-auto mb-6`}>
                <prop.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{prop.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{prop.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ValueProps;
