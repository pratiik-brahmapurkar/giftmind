import { SEOHead } from "@/components/common/SEOHead";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BlogSeo from "@/components/blog/BlogSeo";

const UPDATED = "April 5, 2026";

const content = `
## Account Terms

By creating a GiftMind account, you agree to:

- Provide accurate and complete registration information.
- Maintain the security of your account credentials.
- Accept responsibility for all activity under your account.
- Be at least 13 years of age to use the service.

GiftMind reserves the right to suspend or terminate accounts that violate these terms.

## Credit Purchases

- Credits are the virtual currency used to generate AI-powered gift recommendations on GiftMind.
- Credit packages are priced in Indian Rupees (INR) and US Dollars (USD).
- Purchased credits are valid for the number of days specified in the package (typically 365 days).
- Credits are non-transferable between accounts.
- Prices are subject to change, but changes do not affect previously purchased credits.

## Refunds

- Credits purchased within the last 7 days and not yet used may be refunded in full.
- Partially used credit packages are non-refundable.
- Expired credits are non-refundable.
- Free credits (signup bonus, referral rewards) are non-refundable.
- See our [Refund Policy](/refund-policy) for complete details.

## Acceptable Use

You agree not to:

- Use GiftMind for any illegal or unauthorized purpose.
- Attempt to reverse-engineer, decompile, or hack the service.
- Use automated tools (bots, scrapers) to access the service.
- Share or resell your account or credits.
- Submit harmful, abusive, or misleading content.
- Interfere with the service's infrastructure or other users' experience.

## Intellectual Property

- GiftMind, its logo, and branding are trademarks of GiftMind.
- AI-generated gift recommendations are provided for personal use.
- You retain ownership of any personal data you submit.
- The service's code, design, and AI models are proprietary.

## Limitation of Liability

- GiftMind provides gift recommendations on an "as is" basis.
- We do not guarantee the availability, accuracy, or suitability of any recommended product.
- We are not responsible for purchases made on third-party marketplaces (Amazon, Flipkart, etc.).
- Our total liability is limited to the amount you paid for credits in the preceding 12 months.
- We are not liable for indirect, incidental, or consequential damages.

## Termination

- You may delete your account at any time from Settings.
- We may terminate accounts that violate these terms, with or without notice.
- Upon termination, unused credits are forfeited (unless eligible for refund).
- Sections on Limitation of Liability and Intellectual Property survive termination.

## Changes to Terms

We may update these terms from time to time. We will notify registered users of significant changes via email. Continued use of GiftMind after changes constitutes acceptance.

## Contact

For questions about these terms, contact us at **support@giftmind.in**.
`;

function markdownToHtml(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hula])/gm, (line) => line ? `<p>${line}</p>` : '')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hul])/g, '$1')
    .replace(/(<\/[hul].*?>)<\/p>/g, '$1');
}

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Terms of Service" description="Terms of Service for GiftMind." noIndex={true} />
      <BlogSeo title="Terms of Service" description="GiftMind Terms of Service — your agreement when using our platform." />
      <Navbar />
      <main className="max-w-[720px] mx-auto px-4 pt-24 pb-12">
        <h1 className="text-3xl font-bold font-['Clash_Display',sans-serif] mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {UPDATED}</p>
        <article className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:text-base prose-p:leading-relaxed prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
        </article>
      </main>
      <Footer />
    </div>
  );
}
