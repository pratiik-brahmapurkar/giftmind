import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "How is GiftMind different from just asking ChatGPT?",
    a: "GiftMind is built around the gifting workflow: recipient profiles, occasion context, confidence scores, relationship signals, and store links for the right country. Instead of a broad list, you get three choices you can compare and act on.",
  },
  {
    q: "Which stores do you link to?",
    a: "We auto-detect your country and show relevant local stores. For example: Amazon, Flipkart, Myntra in India · Amazon, Etsy, Uncommon Goods in the US · Amazon, John Lewis, NOTHS in the UK · Amazon, Fnac, Cdiscount in France — and many more across 12 regions. New stores are added regularly.",
  },
  {
    q: "How much does it cost?",
    a: "Spark is free with 15 credits every month. Pro is coming soon at $5.99/month for unlimited credits, profiles, redos, and premium features.",
  },
  {
    q: "Can I pay for Pro now?",
    a: "Not yet. Pro is waitlist-only while we validate demand. Join the waitlist and we will email you when subscriptions are ready.",
  },
  {
    q: "What happens when my credits expire?",
    a: "Spark credits refresh monthly and unused free credits do not roll over. Your saved people, gift history, and account stay available.",
  },
  {
    q: "Is my data private?",
    a: "Yes. We never sell your data. Recipient profiles and gift history are encrypted and only visible to you. You can delete all your data anytime from Settings.",
  },
  {
    q: "What if I don't like the recommendations?",
    a: "You can regenerate within the same session up to your plan's limit. You can also refine the recipient details over time so future recommendations get more specific.",
  },
  {
    q: "Can I use GiftMind for Diwali, Eid, Christmas, and other cultural occasions?",
    a: "Absolutely. GiftMind understands cultural gifting norms — auspicious symbols for Diwali, halal considerations for Eid, stocking stuffer budgets for Christmas, shagun amounts for Indian weddings. The AI adjusts recommendations based on the occasion's cultural context.",
  },
  {
    q: "Can I send a gift to someone in another country?",
    a: "Yes! Just tell us where your recipient is located, and we'll show you stores that deliver to their country with culturally appropriate recommendations. Perfect for diaspora gifting — whether you're in London gifting to parents in Delhi, or in Dubai gifting to a friend in New York.",
  },
];

const FAQ = () => {
  return (
    <section className="bg-card py-20 md:py-24">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 font-heading text-3xl font-bold md:text-4xl">
            Questions before your first gift?
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border-b border-border transition-all hover:bg-muted/40 data-[state=open]:border-l-[3px] data-[state=open]:border-l-primary data-[state=open]:pl-4"
              >
                <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};

export default FAQ;
