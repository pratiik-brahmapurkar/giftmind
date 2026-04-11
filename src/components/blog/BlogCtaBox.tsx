import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBlogCtaUrl } from "@/lib/blog";

interface BlogCtaBoxProps {
  title?: string | null;
  description?: string;
  url?: string | null;
  occasion?: string | null;
  onClick?: () => void;
}

export default function BlogCtaBox({
  title,
  description = "Get AI-powered recommendations with confidence scores and buy links tailored to the occasion.",
  url,
  occasion,
  onClick,
}: BlogCtaBoxProps) {
  const href = buildBlogCtaUrl(url, occasion);

  return (
    <section className="my-10 rounded-[28px] border border-primary/15 bg-[linear-gradient(135deg,rgba(124,58,237,0.08),rgba(244,114,182,0.1),rgba(255,255,255,0.95))] p-7 text-center shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">GiftMind CTA</p>
      <h3 className="mt-2 text-2xl font-semibold text-slate-950">
        {title || "Find the Perfect Gift"}
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
        {description}
      </p>
      <Button asChild className="mt-5 h-11 rounded-full px-6">
        <a href={href} onClick={onClick}>
          {title || "Find the Perfect Gift"} <ArrowRight className="ml-2 h-4 w-4" />
        </a>
      </Button>
    </section>
  );
}
