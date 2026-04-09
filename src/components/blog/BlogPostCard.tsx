import { Link } from "react-router-dom";
import { format } from "date-fns";

interface BlogPostCardProps {
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  category_name?: string;
  category_slug?: string;
  published_at: string | null;
  content: string | null;
  author_name?: string;
}

function estimateReadTime(content: string): number {
  return Math.max(1, Math.round((content || "").trim().split(/\s+/).filter(Boolean).length / 200));
}

export default function BlogPostCard({ slug, title, excerpt, featured_image, category_name, published_at, content, author_name }: BlogPostCardProps) {
  const readTime = estimateReadTime(content || "");

  return (
    <Link to={`/blog/${slug}`} className="group block">
      <div className="rounded-lg border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div className="relative overflow-hidden aspect-video">
          {featured_image ? (
            <img
              src={featured_image}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
              width={1200}
              height={675}
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-sm">No image</div>
          )}
          {category_name && (
            <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">
              {category_name}
            </span>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-bold text-lg leading-tight line-clamp-2 mb-1.5">{title}</h3>
          {excerpt && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{excerpt}</p>}
          <div className="flex items-center text-xs text-muted-foreground gap-1">
            <span>{author_name || "GiftMind"}</span>
            <span>·</span>
            <span>{published_at ? format(new Date(published_at), "MMM dd, yyyy") : "Draft"}</span>
            <span>·</span>
            <span>{readTime} min read</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
