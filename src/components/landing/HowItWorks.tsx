import { motion } from "framer-motion";
import { Users, Brain, ShoppingCart } from "lucide-react";

const steps = [
  {
    icon: Users,
    title: "Describe the recipient",
    description: "Add the relationship, occasion, budget, country, and a few details that make them them.",
    step: "01",
  },
  {
    icon: Brain,
    title: "Understand each pick",
    description: "Get three ideas with a confidence score, why it fits, and what the gift communicates.",
    step: "02",
  },
  {
    icon: ShoppingCart,
    title: "Choose and buy faster",
    description: "Use regional store links to compare options, then save the choice for future gifting.",
    step: "03",
  },
];

const HowItWorks = () => {
  return (
    <section className="bg-card py-20 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            From vague idea to confident gift
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            A faster workflow for moments when the gift needs to feel considered, not convenient.
          </p>
        </motion.div>

        <div className="relative max-w-5xl mx-auto">
          <div className="hidden md:block absolute top-[4.5rem] left-[16.67%] right-[16.67%] border-t-2 border-dashed border-primary/20 z-0" />

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                className="group relative z-10 rounded-xl border border-border/70 bg-background p-7 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
              >
                <div className="text-6xl font-bold text-primary/10 absolute top-4 right-6 font-heading">
                  {step.step}
                </div>
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 text-amber-800 transition-transform duration-300 group-hover:scale-105">
                  <step.icon className="h-7 w-7" strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-semibold transition-colors group-hover:text-amber-800">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
