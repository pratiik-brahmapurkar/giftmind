import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const FinalCTA = () => {
  return (
    <section
      className="py-20 bg-gradient-to-br from-[#D4A04A] to-[#C88D33]"
    >
      <div className="container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold font-heading text-white mb-4">
            Stop guessing. Start gifting with confidence.
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
            3 free credits. 60 seconds to your first recommendation. No credit card needed.
          </p>
          <Link to="/signup">
            <button
              className="h-14 px-10 rounded-xl text-lg font-semibold transition-all duration-200 hover:scale-[1.02] bg-white text-[#6F5326] shadow-[0_4px_20px_rgba(255,255,255,0.2)]"
            >
              Find the Perfect Gift — Free →
            </button>
          </Link>
          <p className="text-white/60 text-sm mt-4">
            Join 200+ gifters in 10+ countries
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default FinalCTA;
