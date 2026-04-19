import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Gift, Heart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const GiftBoxAnimation = () => (
  <div className="relative h-64 w-64 md:h-80 md:w-80">
    <div className="absolute inset-8 rounded-full bg-amber-200/50 blur-3xl" />
    <motion.div
      className="relative flex h-full w-full items-center justify-center"
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="relative">
        <div className="relative h-32 w-32 overflow-hidden rounded-[28px] gradient-primary shadow-xl md:h-40 md:w-40">
          <div className="absolute inset-0 flex items-center justify-center">
            <Gift className="h-12 w-12 text-primary-foreground md:h-16 md:w-16" strokeWidth={1.5} />
          </div>
          <div className="absolute left-1/2 top-0 h-full w-4 -translate-x-1/2 bg-white/25" />
          <div className="absolute left-0 top-1/2 h-4 w-full -translate-y-1/2 bg-white/25" />
        </div>
        <motion.div
          className="absolute left-1/2 top-0 h-8 w-36 -translate-x-1/2 -translate-y-5 rounded-2xl bg-[linear-gradient(135deg,#E4C663_0%,#D4A04A_100%)] shadow-lg md:h-10 md:w-44"
          animate={{ rotate: [-8, -14, -8], y: [-18, -28, -18] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute -top-2 left-1/2 h-5 w-8 -translate-x-1/2 rounded-full bg-[#4C2A85]/20" />
        </motion.div>
      </div>
    </motion.div>

    {[0, 1, 2, 3].map((index) => (
      <motion.div
        key={index}
        className="absolute"
        style={{
          top: `${16 + index * 17}%`,
          left: `${10 + index * 18}%`,
        }}
        animate={{
          y: [0, -16, 0],
          opacity: [0.35, 1, 0.35],
          scale: [0.85, 1.15, 0.85],
        }}
        transition={{
          duration: 2.2 + index * 0.25,
          repeat: Infinity,
          delay: index * 0.2,
        }}
      >
        {index % 2 === 0 ? (
          <Sparkles className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
        ) : (
          <Heart className="h-3.5 w-3.5 text-[#C25450]" strokeWidth={1.5} />
        )}
      </motion.div>
    ))}
  </div>
);

const Hero = () => {
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(212,160,74,0.18),transparent_44%),radial-gradient(circle_at_top_right,rgba(76,42,133,0.08),transparent_38%)]" />

      <div className="container relative z-10 mx-auto px-4 py-20 md:py-24">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          <motion.div
            className="flex-1 text-center lg:text-left"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Confidence-first gift intelligence
            </motion.div>

            <h1 className="font-heading text-display-md text-balance text-foreground md:text-display-lg">
              Stop guessing.{" "}
              <span className="text-amber-700">Start gifting</span>{" "}
              <span className="text-balance">with confidence.</span>
            </h1>

            <p className="mt-6 max-w-xl text-body-lg text-muted-foreground">
              GiftMind gives you warm, precise recommendations with confidence scores, cultural context, and direct store links so you can choose once and move forward calmly.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild variant="hero" size="lg" className="text-base">
                <Link to="/signup">
                  <Gift className="mr-2 h-5 w-5" strokeWidth={1.5} />
                  Find the Perfect Gift
                </Link>
              </Button>
              <Button asChild variant="heroGhost" size="lg" className="text-base">
                <a href="#how">
                  See How It Works
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
                </a>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-neutral-700 lg:justify-start">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={1.5} />
                3 free sessions
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={1.5} />
                No credit card required
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={1.5} />
                60-second results
              </span>
            </div>
          </motion.div>

          <motion.div
            className="flex flex-1 justify-center"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <GiftBoxAnimation />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
