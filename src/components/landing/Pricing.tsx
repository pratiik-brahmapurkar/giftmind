import { motion } from "framer-motion";
import PricingCards from "@/components/pricing/PricingCards";

const Pricing = () => {
  return (
    <section className="py-24 gradient-mesh">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            Simple, Honest <span className="text-primary">Pricing</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Pay per use. No monthly subscriptions. Prices adjusted for your region.
          </p>
        </motion.div>

        <PricingCards />
      </div>
    </section>
  );
};

export default Pricing;
