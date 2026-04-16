import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import PricingCards from "@/components/pricing/PricingCards";

const Pricing = () => {
  const navigate = useNavigate();
  const handleBuyClick = (slug: string) => navigate(`/signup?plan=${slug}`);

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
            Simple, honest pricing
          </h2>
          <p className="text-muted-foreground text-lg">
            Pay per use. No subscriptions. No surprises.
          </p>
        </motion.div>

        <PricingCards onBuyClick={handleBuyClick} />
      </div>
    </section>
  );
};

export default Pricing;
