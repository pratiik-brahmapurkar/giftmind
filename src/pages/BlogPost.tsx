import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Copy, Linkedin, MessageCircleMore, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { SEOHead } from "@/components/common/SEOHead";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BlogPostCard from "@/components/blog/BlogPostCard";
import BlogMarkdown from "@/components/blog/BlogMarkdown";
import BlogCtaBox from "@/components/blog/BlogCtaBox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trackEvent } from "@/lib/posthog";
import { getExcerptFallback, getReadTimeMinutes, splitMarkdownForCta } from "@/lib/blog";

type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  category_id: string | null;
  tags: string[] | null;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  view_count: number | null;
  cta_click_count: number | null;
  cta_type: string | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_occasion: string | null;
  status: string | null;
  blog_categories: { name: string; slug: string } | null;
};

export default function BlogPost() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const previewRequested = searchParams.get("preview") === "true";
  const { isAdmin, loading: adminLoading } = useAdminCheck();

  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", slug, previewRequested, isAdmin],
    enabled: !!slug && (!previewRequested || !adminLoading),
    queryFn: async () => {
      let query = supabase
        .from("blog_posts")
        .select("*, blog_categories(name, slug)")
        .eq("slug", slug!)
        .limit(1);

      if (!(previewRequested && isAdmin)) {
        query = query.eq("status", "published");
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return (data as BlogPostRow | null) || null;
    },
  });

  const { data: relatedPosts = [] } = useQuery({
    queryKey: ["related-blog-posts", post?.id, post?.category_id],
    enabled: !!post?.id && !!post?.category_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, excerpt, content, featured_image_url, featured_image_alt, published_at, blog_categories(name, slug)")
        .eq("status", "published")
        .eq("category_id", post!.category_id!)
        .neq("id", post!.id)
        .order("published_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!post || previewRequested || post.status !== "published") return;

    const trackView = async () => {
      const newRpc = await supabase.rpc("increment_blog_view", { post_id: post.id });
      if (!newRpc.error) return;

      const legacyRpc = await supabase.rpc("increment_post_views", { post_slug: post.slug });
      if (!legacyRpc.error) return;

      await supabase
        .from("blog_posts")
        .update({ view_count: (post.view_count || 0) + 1 })
        .eq("id", post.id);
    };

    void trackView();
  }, [post?.id, previewRequested]);

  const contentParts = useMemo(() => splitMarkdownForCta(post?.content || "", 3), [post?.content]);
  const postUrl = typeof window !== "undefined" ? window.location.href : `https://giftmind.in/blog/${slug}`;
  const readTime = getReadTimeMinutes(post?.content);

  const handleShare = async (network: "copy" | "whatsapp" | "twitter" | "linkedin") => {
    const encodedUrl = encodeURIComponent(postUrl);
    const encodedTitle = encodeURIComponent(post?.title || "");

    if (network === "copy") {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
      return;
    }

    const destination =
      network === "whatsapp"
        ? `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`
        : network === "twitter"
          ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
          : `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

    window.open(destination, "_blank", "noopener,noreferrer");
  };

  const handleCtaClick = async () => {
    if (!post) return;

    trackEvent("blog_cta_clicked", {
      slug: post.slug,
      occasion: post.cta_occasion,
    });

    await supabase
      .from("blog_posts")
      .update({ cta_click_count: (post.cta_click_count || 0) + 1 })
      .eq("id", post.id);
  };

  if (isLoading || (previewRequested && adminLoading)) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 pb-16 pt-28 text-center text-slate-500">Loading post...</main>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 pb-16 pt-28 text-center">
          <h1 className="text-3xl font-semibold text-slate-950">Post not found</h1>
          <p className="mt-3 text-slate-500">The post may be unpublished or the slug is incorrect.</p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/blog">Back to blog</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const categoryName = (post.blog_categories as { name?: string } | null)?.name || "Blog";
  const categorySlug = (post.blog_categories as { slug?: string } | null)?.slug;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_18%,#f8fafc_100%)]">
      <SEOHead
        title={post.meta_title || post.title}
        description={post.meta_description || getExcerptFallback(post)}
        image={post.featured_image_url || undefined}
        type="article"
        publishedAt={post.published_at || undefined}
        keywords={post.tags || []}
      />
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        {previewRequested && isAdmin ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This is a preview. It is not visible to the public.
          </div>
        ) : null}

        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link to="/blog" className="hover:text-primary">Blog</Link>
          <span>/</span>
          {categorySlug ? (
            <Link to={`/blog/category/${categorySlug}`} className="hover:text-primary">{categoryName}</Link>
          ) : (
            <span>{categoryName}</span>
          )}
          <span>/</span>
          <span className="truncate text-slate-700">{post.title}</span>
        </nav>

        <article className="overflow-hidden rounded-[34px] border border-slate-200/80 bg-white shadow-sm">
          {post.featured_image_url ? (
            <img
              src={post.featured_image_url}
              alt={post.featured_image_alt || post.title}
              className="max-h-[400px] w-full object-cover"
            />
          ) : null}

          <div className="px-6 py-8 sm:px-10">
            <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-primary">
              {categoryName}
            </Badge>
            <h1 className="mt-4 font-['Clash_Display',sans-serif] text-4xl leading-tight text-slate-950 sm:text-5xl">
              {post.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>By GiftMind</span>
              <span>·</span>
              <span>{post.published_at ? format(new Date(post.published_at), "MMMM d, yyyy") : "Draft"}</span>
              <span>·</span>
              <span>{readTime} min read</span>
            </div>

            <div className="mt-10">
              <BlogMarkdown content={contentParts.before} />
              {post.cta_type !== "none" && post.cta_text ? (
                <BlogCtaBox
                  title={post.cta_text}
                  url={post.cta_url}
                  occasion={post.cta_occasion}
                  onClick={() => {
                    void handleCtaClick();
                  }}
                />
              ) : null}
              {contentParts.after ? <BlogMarkdown content={contentParts.after} /> : null}
            </div>

            <section className="mt-10 border-t border-slate-200 pt-8">
              <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Share2 className="h-4 w-4" />
                Share
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="rounded-full" onClick={() => void handleShare("whatsapp")}>
                  <MessageCircleMore className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => void handleShare("twitter")}>
                  X / Twitter
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => void handleShare("linkedin")}>
                  <Linkedin className="mr-2 h-4 w-4" />
                  LinkedIn
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => void handleShare("copy")}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
            </section>
          </div>
        </article>

        {relatedPosts.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-2xl font-semibold text-slate-950">Related Posts</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {relatedPosts.map((related) => (
                <BlogPostCard
                  key={related.id}
                  slug={related.slug}
                  title={related.title}
                  excerpt={related.excerpt}
                  featuredImageUrl={related.featured_image_url}
                  featuredImageAlt={related.featured_image_alt}
                  categoryName={(related.blog_categories as { name?: string } | null)?.name || null}
                  publishedAt={related.published_at}
                  content={related.content}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
