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
    <section className="bg-[#F6EFE5] py-14 sm:py-20 lg:py-24">
      <div className="container mx-auto px-3 sm:px-4">
        <PricingCards onBuyClick={handleBuyClick} />
      </div>
    </section>
  );
};

export default Pricing;
