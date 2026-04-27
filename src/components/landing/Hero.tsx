import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Gift, Heart, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const giftMatches = [
  {
    title: "Handcrafted brass diya set",
    reason: "Traditional, premium, and festive without being impersonal.",
    score: 94,
    store: "Amazon.in",
  },
  {
    title: "Silk stole in warm jewel tones",
    reason: "Elegant, wearable, and suitable for a close family gift.",
    score: 89,
    store: "Myntra",
  },
  {
    title: "Artisanal sweets hamper",
    reason: "Safe for the occasion, but still feels curated and thoughtful.",
    score: 82,
    store: "Local stores",
  },
];

const HeroPreview = () => (
  <TooltipProvider delayDuration={150}>
    <div className="relative w-full max-w-[440px]">
    <div className="absolute inset-8 rounded-full bg-amber-200/35 blur-3xl" />

    <motion.div
      className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-card p-5 shadow-xl transition-shadow duration-300 hover:shadow-2xl"
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber-100/60 to-transparent"
        animate={{ opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Gift brief</p>
          <p className="mt-1 text-sm font-medium text-foreground">Mother-in-law · Diwali · India</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Warm", "Traditional", "Under ₹5k"].map((chip) => (
              <Tooltip key={chip}>
                <TooltipTrigger asChild>
                  <span className="cursor-help rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800">
                    {chip}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Context GiftMind uses to avoid generic recommendations.
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <motion.div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-amber-50 shadow-inner"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <img src="/brand/giftmind-symbol.png" alt="" className="h-14 w-14 object-contain" />
        </motion.div>
      </div>

      <div className="relative my-5 h-9">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <motion.div
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber-500 shadow-glow-amber"
          animate={{ left: ["4%", "94%", "4%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-200 bg-card">
          <Sparkles className="h-4 w-4 text-amber-600" strokeWidth={1.5} />
        </div>
      </div>

      <div className="relative space-y-3">
        {giftMatches.map((match, index) => (
          <motion.div
            key={match.title}
            className="rounded-xl border border-border/70 bg-background p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-md"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.35 + index * 0.18 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                    {index + 1}
                  </span>
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">{match.title}</p>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{match.reason}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="shrink-0 cursor-help text-right">
                    <p className="font-mono text-lg font-bold text-success">{match.score}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">score</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-56">
                  Confidence combines fit, occasion relevance, budget, cultural context, and availability.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-success"
                  initial={{ width: 0 }}
                  animate={{ width: `${match.score}%` }}
                  transition={{ duration: 0.65, delay: 0.55 + index * 0.18 }}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {match.store}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Store links are localized by recipient country where available.
                </TooltipContent>
              </Tooltip>
            </div>
          </motion.div>
        ))}
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
  </TooltipProvider>
);

const Hero = () => {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#FAF7F2_0%,#FDFCFA_72%,#FFFFFF_100%)]">
      <div className="container relative z-10 mx-auto px-4 pb-16 pt-24 md:pb-20 md:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr,0.95fr] lg:gap-16">
          <motion.div
            className="text-center lg:text-left"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Built for thoughtful gifting, not generic lists
            </motion.div>

            <h1 className="font-heading text-display-md text-balance text-foreground md:text-display-lg">
              AI gift recommendations that feel{" "}
              <span className="text-amber-700">personal</span>, not random.
            </h1>

            <p className="mt-6 max-w-xl text-body-lg text-muted-foreground">
              Tell GiftMind who you are buying for. Get three thoughtful options with confidence scores, cultural context, and links to stores that work for your region.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild variant="hero" size="lg" className="text-base">
                <Link to="/signup">
                  <Gift className="mr-2 h-5 w-5" strokeWidth={1.5} />
                  Get 3 Gift Ideas
                </Link>
              </Button>
              <Button asChild variant="heroGhost" size="lg" className="text-base">
                <a href="#how">
                  See the Flow
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
                </a>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-neutral-700 lg:justify-start">
              <TooltipProvider delayDuration={150}>
                {[
                  { icon: CheckCircle2, label: "Free monthly credits", tip: "Spark includes free credits every month to try recommendations." },
                  { icon: Search, label: "Store links included", tip: "GiftMind prefers stores relevant to the recipient country." },
                  { icon: ShieldCheck, label: "No credit card", tip: "Create an account and start without entering payment details." },
                ].map((item) => (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-amber-50 hover:text-amber-900">
                        <item.icon className="h-3.5 w-3.5 text-success" strokeWidth={1.5} />
                        {item.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{item.tip}</TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          </motion.div>

          <motion.div
            className="flex justify-center lg:justify-end"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <HeroPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
