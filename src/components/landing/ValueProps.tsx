import { motion } from "framer-motion";
import { Clock, Target, Globe } from "lucide-react";

const props = [
  {
    icon: Clock,
    title: "Cuts the search spiral",
    description: "Skip the tab overload. Start from three strong choices with clear reasoning.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Target,
    title: "Explains the fit",
    description: "See why each idea works for this person, not just why it is popular.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: Globe,
    title: "Respects context",
    description: "Adjusts for occasion, relationship, budget, country, and cultural expectations.",
    color: "bg-success/10 text-success",
  },
];

const ValueProps = () => {
  return (
    <section className="bg-background py-24">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Why GiftMind feels different
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            It narrows the decision, explains the logic, and keeps the gift tied to the relationship.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {props.map((prop, i) => (
            <motion.div
              key={prop.title}
              className="group rounded-xl border border-border/60 bg-card p-8 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-200 hover:shadow-lg"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <div className={`mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${prop.color} transition-transform duration-300 group-hover:scale-110`}>
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
