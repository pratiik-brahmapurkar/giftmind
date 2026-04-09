import { SEOHead } from "@/components/common/SEOHead";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BlogSeo from "@/components/blog/BlogSeo";

const UPDATED = "April 5, 2026";

const content = `
## What We Collect

When you create an account on GiftMind, we collect:

- **Account information**: Your name, email address, and password (encrypted).
- **Profile data**: Country, language preference, and currency preference.
- **Recipient data**: Names, relationships, interests, and important dates you provide for gift recommendations.
- **Gift session data**: Occasion, budget, context tags, and AI-generated recommendations.
- **Payment data**: Transaction records for credit purchases. We do not store credit card numbers — payments are processed by our third-party payment provider.
- **Usage data**: Pages visited, features used, and interaction patterns to improve our service.

## Why We Collect It

We collect your data to:

- Provide personalized gift recommendations powered by AI.
- Save your recipient profiles and gift history for future sessions.
- Process credit purchases and maintain transaction records.
- Improve our recommendation algorithms and user experience.
- Send you relevant notifications (gift reminders, credit expiry alerts) if you opt in.

## How We Use It

- **AI Recommendations**: Your recipient data and preferences are sent to our AI models to generate gift suggestions. We use Google Gemini and OpenAI models through secure API connections.
- **Analytics**: We use aggregated, anonymized data to understand usage patterns and improve GiftMind.
- **Communications**: We may send transactional emails (purchase confirmations, password resets) and optional marketing emails (you can unsubscribe anytime).

## Third Parties

We share data with the following third-party services:

- **Lovable Cloud** (backend infrastructure): Stores your data securely.
- **AI Providers** (Google, OpenAI): Processes gift recommendation requests. No personal data beyond session context is shared.
- **Payment Processors**: Handles credit card transactions securely.
- **Analytics Tools**: Aggregated usage data for service improvement.

We never sell your personal data to advertisers or data brokers.

## Your Rights

You have the right to:

- **Access** your personal data at any time through your profile settings.
- **Correct** inaccurate information in your profile.
- **Export** your data (recipient list, gift history) in a standard format.
- **Delete** your account and all associated data.
- **Opt out** of marketing communications.

## Data Deletion

To delete your account and all associated data:

1. Go to **Settings** in your dashboard.
2. Click **"Delete Account"** at the bottom of the page.
3. Confirm the deletion. This action is irreversible.

Alternatively, email **support@giftmind.in** with your registered email to request deletion. We will process your request within 30 days.

## Contact

For privacy-related questions or concerns:

**Email**: support@giftmind.in  
**Subject line**: Privacy Inquiry  

We aim to respond within 48 hours.
`;

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Privacy Policy" description="Privacy Policy of GiftMind." noIndex={true} />
      <BlogSeo title="Privacy Policy" description="GiftMind Privacy Policy — how we collect, use, and protect your data." />
      <Navbar />
      <main className="max-w-[720px] mx-auto px-4 pt-24 pb-12">
        <h1 className="text-3xl font-bold font-['Clash_Display',sans-serif] mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {UPDATED}</p>
        <article className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:text-base prose-p:leading-relaxed prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
        </article>
      </main>
      <Footer />
    </div>
  );
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- \*\*(.+?)\*\*: (.+)$/gm, '<li><strong>$1</strong>: $2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, (line) => line ? `<p>${line}</p>` : '')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hul])/g, '$1')
    .replace(/(<\/[hul].*?>)<\/p>/g, '$1');
}
