import { Link } from "react-router-dom";
import { format } from "date-fns";
import { getReadTimeMinutes } from "@/lib/blog";
import { cn } from "@/lib/utils";

interface BlogPostCardProps {
  slug: string;
  title: string;
  excerpt: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt?: string | null;
  categoryName?: string | null;
  publishedAt: string | null;
  content: string | null;
  className?: string;
}

export default function BlogPostCard({
  slug,
  title,
  excerpt,
  featuredImageUrl,
  featuredImageAlt,
  categoryName,
  publishedAt,
  content,
  className,
}: BlogPostCardProps) {
  const readTime = getReadTimeMinutes(content);

  return (
    <Link
      to={`/blog/${slug}`}
      className={cn(
        "group block overflow-hidden rounded-[26px] border border-slate-200/70 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {featuredImageUrl ? (
          <img
            src={featuredImageUrl}
            alt={featuredImageAlt || title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.14),rgba(255,255,255,1)_55%)] px-8 text-center text-sm text-slate-500">
            No featured image
          </div>
        )}
        {categoryName && (
          <span className="absolute left-4 top-4 rounded-full bg-white/92 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">
            {categoryName}
          </span>
        )}
      </div>
      <div className="space-y-3 p-5">
        <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-slate-950">{title}</h3>
        {excerpt && (
          <p className="line-clamp-3 text-sm leading-6 text-slate-600">{excerpt}</p>
        )}
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          {publishedAt ? format(new Date(publishedAt), "MMM d, yyyy") : "Draft"} · {readTime} min read
        </div>
      </div>
    </Link>
  );
}
