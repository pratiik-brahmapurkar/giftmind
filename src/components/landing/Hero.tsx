import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Gift, Sparkles, Heart, CheckCircle2, ArrowRight } from "lucide-react";

const GiftBoxAnimation = () => (
  <div className="relative w-64 h-64 md:w-80 md:h-80">
    {/* Glow */}
    <div className="absolute inset-0 rounded-full gradient-primary opacity-20 blur-3xl animate-pulse-glow" />
    
    {/* Box */}
    <motion.div
      className="relative w-full h-full flex items-center justify-center"
      animate={{ y: [0, -12, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="relative">
        {/* Main box */}
        <div className="w-32 h-28 md:w-40 md:h-36 rounded-xl gradient-primary shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <Gift className="w-12 h-12 md:w-16 md:h-16 text-primary-foreground opacity-90" />
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-full bg-accent/60" />
          <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-4 bg-accent/60" />
        </div>
        {/* Lid */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-36 md:w-44 h-8 rounded-lg gradient-primary shadow-lg origin-bottom-right"
          animate={{ rotate: [-8, -15, -8], y: [-15, -25, -15], x: ["-45%", "-40%", "-45%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-6 rounded-full bg-accent" />
        </motion.div>
      </div>
    </motion.div>

    {/* Floating particles */}
    {[...Array(5)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute"
        style={{
          top: `${15 + i * 15}%`,
          left: `${10 + i * 18}%`,
        }}
        animate={{
          y: [0, -20, 0],
          opacity: [0.3, 1, 0.3],
          scale: [0.8, 1.2, 0.8],
        }}
        transition={{
          duration: 2 + i * 0.5,
          repeat: Infinity,
          delay: i * 0.3,
        }}
      >
        {i % 3 === 0 ? (
          <Sparkles className="w-4 h-4 text-warning" />
        ) : i % 3 === 1 ? (
          <Heart className="w-3 h-3 text-accent" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-primary-light" />
        )}
      </motion.div>
    ))}
  </div>
);

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0 hero-gradient-mesh" />

      <div className="container mx-auto px-4 py-20 md:py-0 relative z-10">
        <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
          {/* Text */}
          <motion.div
            className="flex-1 text-center md:text-left"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100/50 border border-amber-200 text-amber-700 text-sm font-medium mb-6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Sparkles className="w-4 h-4" />
              AI-Powered Gift Intelligence
            </motion.div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight mb-6">
              Stop Guessing.{" "}
              <span className="text-amber-700">
                Start Gifting
              </span>{" "}
              <span className="tracking-normal">with Confidence.</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mb-8 leading-relaxed">
              AI-powered gift recommendations that tell you <strong className="text-foreground">WHY</strong> it's right, what it communicates, and where to buy — in 60 seconds.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Button variant="hero" size="lg" className="text-base px-8 py-6 rounded-lg animate-cta-pulse">
                <Gift className="w-5 h-5 mr-2" />
                Find the Perfect Gift — Free
              </Button>
              <Button variant="ghost" size="lg" className="text-base px-8 py-6 rounded-lg group text-neutral-700 hover:text-neutral-900 border border-transparent hover:border-neutral-200">
                See How It Works
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 justify-center md:justify-start text-sm text-neutral-700 font-medium">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> No credit card required</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> 3 free sessions</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> 60-second results</span>
            </div>
          </motion.div>

          {/* Gift Animation — explicit size to prevent layout shift */}
          <motion.div
            className="flex-1 flex justify-center w-[256px] h-[200px] md:w-[320px] md:h-[320px]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <GiftBoxAnimation />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
