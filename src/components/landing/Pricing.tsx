import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import PricingCards from "@/components/pricing/PricingCards";
import { useAuth } from "@/contexts/AuthContext";

const Pricing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const handleBuyClick = (slug: string) => {
    if (user) {
      navigate("/plans");
    } else {
      navigate(`/signup?plan=${slug}`);
    }
  };

  return (
    <section className="bg-[#F2EDE4] py-24">
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
            Start free. Join the Pro waitlist when you want unlimited gifting.
          </p>
        </motion.div>

        <PricingCards onBuyClick={handleBuyClick} />
      </div>
    </section>
  );
};

export default Pricing;
