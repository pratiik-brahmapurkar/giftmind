import { motion } from "framer-motion";
import { Users, Brain, ShoppingCart } from "lucide-react";

const steps = [
  {
    icon: Users,
    title: "Tell us about the person",
    description: "Share the relationship, interests, occasion, and budget. The more we know, the better we match.",
    step: "01",
  },
  {
    icon: Brain,
    title: "Get confident recommendations",
    description: "Receive 3 AI-matched gifts with confidence scores and reasons WHY each gift is perfect.",
    step: "02",
  },
  {
    icon: ShoppingCart,
    title: "Buy with one click",
    description: "Get direct links to top stores in your region — compare prices and buy instantly.",
    step: "03",
  },
];

const HowItWorks = () => {
  return (
    <section className="py-24 bg-card">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How It <span className="text-primary">Works</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Three simple steps to the perfect gift. Every time.
          </p>
        </motion.div>

        <div className="relative max-w-5xl mx-auto">
          <div className="hidden md:block absolute top-[4.5rem] left-[16.67%] right-[16.67%] border-t-2 border-dashed border-primary/20 z-0" />

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                className="relative text-center p-8 rounded-xl bg-background card-shadow hover:card-shadow-hover transition-shadow duration-300 group z-10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
              >
                <div className="text-6xl font-bold text-primary/10 absolute top-4 right-6 font-heading">
                  {step.step}
                </div>
                <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                  <step.icon className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
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
