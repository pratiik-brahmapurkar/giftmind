import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const FinalCTA = () => {
  return (
    <section className="bg-[linear-gradient(135deg,#D4A04A_0%,#B8893E_100%)] py-20">
      <div className="container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 font-heading text-3xl font-bold text-amber-950 md:text-4xl">
            Stop guessing. Start gifting with confidence.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg text-amber-950/80">
            3 free credits. 60 seconds to your first recommendation. No credit card needed.
          </p>
          <Button asChild variant="heroGhost" size="xl" className="border-amber-950/10 bg-background/90 text-amber-900 shadow-md hover:bg-background">
            <Link to="/signup">
              Find the Perfect Gift
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </Button>
          <p className="mt-4 text-sm text-amber-950/65">Join 200+ gifters in 10+ countries</p>
        </motion.div>
      </div>
    </section>
  );
};

export default FinalCTA;
