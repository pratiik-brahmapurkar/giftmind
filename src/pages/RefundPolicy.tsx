import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BlogSeo from "@/components/blog/BlogSeo";

const UPDATED = "April 5, 2026";

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <BlogSeo title="Refund Policy" description="GiftMind Credit Refund Policy — understand when and how you can request a refund." />
      <Navbar />
      <main className="max-w-[720px] mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold font-['Clash_Display',sans-serif] mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {UPDATED}</p>
        <article className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:text-base prose-p:leading-relaxed prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground">
          <h2>Credit Refund Policy</h2>
          <ul>
            <li>Credits purchased within the last <strong>7 days</strong> and not yet used may be refunded in full.</li>
            <li>Partially used credit packages are <strong>non-refundable</strong>.</li>
            <li>Expired credits are <strong>non-refundable</strong>.</li>
            <li>Free credits (signup bonus, referral rewards) are <strong>non-refundable</strong>.</li>
          </ul>

          <h2>How to Request a Refund</h2>
          <p>
            To request a refund, email <strong>support@giftmind.in</strong> with:
          </p>
          <ul>
            <li>Your registered email address</li>
            <li>Date of purchase</li>
            <li>Package name and amount paid</li>
            <li>Reason for refund (optional)</li>
          </ul>
          <p>
            We will review your request and respond within <strong>3-5 business days</strong>. Approved refunds are processed to the original payment method within <strong>7-10 business days</strong>.
          </p>

          <h2>Exceptions</h2>
          <p>
            In cases of technical issues where credits were deducted but the service was not delivered (e.g., AI generation failed), we will restore the credits to your account immediately upon verification. No refund request is needed — contact support and we'll fix it.
          </p>

          <h2>Contact</h2>
          <p>
            For refund-related questions: <strong>support@giftmind.in</strong>
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
