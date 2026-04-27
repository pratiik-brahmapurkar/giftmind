import { motion } from "framer-motion";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ProductPreview = () => {
  return (
    <section className="bg-[#F2EDE4] py-20 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-heading text-3xl font-bold text-foreground md:text-4xl">
            A recommendation you can actually act on
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            GiftMind does more than name a product. It gives you the reason, the signal it sends, and the practical next step.
          </p>
        </motion.div>

        <motion.div
          className="mx-auto max-w-[560px]"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <div className="rounded-2xl border border-amber-200 bg-background p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="primary" className="mb-3 w-fit font-sans">
                  Best Match
                </Badge>
                <h3 className="font-heading text-2xl font-semibold text-foreground">
                  Personalized star map of your first date night
                </h3>
              </div>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="w-fit cursor-help rounded-full">
                      <ConfidenceBadge score={92} size="sm" animate={false} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-56">
                    Confidence reflects recipient fit, occasion relevance, budget match, and clarity of reasoning.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <p className="mt-4 text-sm leading-6 text-neutral-600">
              A custom print showing how the sky looked on the night you first met, framed with your names and date.
            </p>

            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Why it works</p>
              <p className="mt-1 text-sm leading-6 text-neutral-700">
                Your partner values meaning over flash. This ties memory, beauty, and personalization together without feeling generic.
              </p>
            </div>

            <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">What it communicates</p>
              <p className="mt-1 text-sm leading-6 text-neutral-700">
                "I remember the details of our story. I picked something about us, not something from a generic list."
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
              <span className="font-mono font-medium text-foreground">$30 – $50</span>
              <span className="text-muted-foreground">Available on Amazon, Etsy, and more</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ProductPreview;
