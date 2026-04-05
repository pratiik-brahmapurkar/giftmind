import { useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MDEditor from "@uiw/react-md-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { Share2, Copy, ArrowRight } from "lucide-react";
import BlogPostCard from "@/components/blog/BlogPostCard";
import BlogSeo from "@/components/blog/BlogSeo";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

function estimateReadTime(content: string): number {
  return Math.max(1, Math.round((content || "").trim().split(/\s+/).filter(Boolean).length / 200));
}

export default function BlogPost() {
  const { slug } = useParams();
  const viewTracked = useRef(false);

  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post-public", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*, blog_categories(name, slug)")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: relatedPosts = [] } = useQuery({
    queryKey: ["related-posts", post?.category_id, post?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*, blog_categories(name, slug)")
        .eq("status", "published")
        .eq("category_id", post!.category_id!)
        .neq("id", post!.id)
        .order("views", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!post?.category_id,
  });

  // Track view (debounced 30s via sessionStorage)
  useEffect(() => {
    if (!slug || viewTracked.current) return;
    const key = `blog_view_${slug}`;
    const last = sessionStorage.getItem(key);
    if (last && Date.now() - parseInt(last) < 30000) return;
    viewTracked.current = true;
    sessionStorage.setItem(key, Date.now().toString());
    supabase.rpc("increment_post_views", { post_slug: slug }).then();
  }, [slug]);

  // CTA click tracking
  const handleCtaClick = async () => {
    if (!post) return;
    await supabase.from("blog_posts").update({ cta_clicks: (post.cta_clicks || 0) + 1 }).eq("id", post.id);
  };

  const readTime = estimateReadTime(post?.content || "");
  const url = typeof window !== "undefined" ? window.location.href : "";
  const categoryName = (post?.blog_categories as any)?.name;

  // Insert CTA after 3rd paragraph
  const contentWithCta = useMemo(() => {
    if (!post?.content) return "";
    const paragraphs = post.content.split("\n\n");
    if (paragraphs.length <= 3) return post.content;
    // We'll render CTA separately via a marker
    return post.content;
  }, [post]);

  // Split content for CTA insertion
  const contentParts = useMemo(() => {
    if (!post?.content) return { before: "", after: "" };
    const lines = post.content.split("\n\n");
    const before = lines.slice(0, 3).join("\n\n");
    const after = lines.slice(3).join("\n\n");
    return { before, after };
  }, [post]);

  const share = (platform: string) => {
    const text = `Check this out: ${post?.title} - ${url}`;
    switch (platform) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post?.title || "")}&url=${encodeURIComponent(url)}`, "_blank");
        break;
      case "linkedin":
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(url);
        toast.success("Link copied!");
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-24 pb-20 text-center text-muted-foreground">Loading...</div>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Post not found</h1>
          <Button asChild><Link to="/blog">Back to Blog</Link></Button>
        </div>
        <Footer />
      </div>
    );
  }

  const ctaLink = post.status === "published" ? "/gift-flow" : "/gift-flow";

  return (
    <div className="min-h-screen bg-background">
      <BlogSeo
        title={post.meta_title || post.title}
        description={post.meta_description || post.excerpt || undefined}
        image={post.featured_image || undefined}
        url={url}
      />
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 pt-24 pb-8">
        {/* Breadcrumb */}
        <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1">
          <Link to="/blog" className="hover:text-primary">Blog</Link>
          {categoryName && (
            <>
              <span>›</span>
              <Link to={`/blog/category/${(post.blog_categories as any)?.slug}`} className="hover:text-primary">{categoryName}</Link>
            </>
          )}
          <span>›</span>
          <span className="truncate max-w-[200px]">{post.title}</span>
        </nav>

        {/* Featured image */}
        {post.featured_image && (
          <img
            src={post.featured_image}
            alt={post.title}
            className="w-full max-h-[400px] object-cover rounded-lg mb-6"
          />
        )}

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold font-['Clash_Display',sans-serif] mb-4">{post.title}</h1>

        {/* Meta */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8 flex-wrap">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            G
          </div>
          <span>By GiftMind</span>
          <span>·</span>
          <span>{post.published_at ? format(new Date(post.published_at), "MMMM dd, yyyy") : "Draft"}</span>
          <span>·</span>
          <span>{readTime} min read</span>
          {categoryName && <Badge variant="secondary" className="text-xs">{categoryName}</Badge>}
        </div>

        {/* Content with CTA */}
        <article className="prose prose-lg max-w-none
          prose-headings:font-bold prose-headings:text-foreground
          prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
          prose-h3:text-xl prose-h3:mt-6
          prose-p:text-base prose-p:leading-relaxed prose-p:text-muted-foreground
          prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-muted/50 prose-blockquote:italic prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:rounded-r
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-img:rounded-lg prose-img:mx-auto
          prose-code:bg-muted prose-code:rounded prose-code:px-1
          prose-li:marker:text-primary
        " data-color-mode="light">
          <MDEditor.Markdown source={contentParts.before} />

          {/* In-article CTA */}
          <Card className="my-8 bg-primary/5 border-primary/20">
            <CardContent className="py-6 text-center space-y-2">
              <p className="font-bold text-lg">Find the Perfect Gift</p>
              <p className="text-sm text-muted-foreground">3 free credits · No card needed · 60-second results</p>
              <Button asChild onClick={handleCtaClick}>
                <Link to={ctaLink}>
                  Try GiftMind Free <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <MDEditor.Markdown source={contentParts.after} />
        </article>

        {/* Share bar */}
        <div className="border-t mt-10 pt-6">
          <p className="text-sm font-medium mb-3 flex items-center gap-2"><Share2 className="h-4 w-4" /> Share this article</p>
          <div className="flex gap-2">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => share("whatsapp")}>WhatsApp</Button>
            <Button size="sm" variant="secondary" onClick={() => share("twitter")}>𝕏 Twitter</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => share("linkedin")}>LinkedIn</Button>
            <Button size="sm" variant="outline" onClick={() => share("copy")}><Copy className="h-3.5 w-3.5 mr-1" /> Copy Link</Button>
          </div>
        </div>

        {/* Related posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4">You might also like</h2>
            <div className="grid md:grid-cols-3 gap-4 overflow-x-auto">
              {relatedPosts.map((p: any) => (
                <BlogPostCard
                  key={p.id}
                  slug={p.slug}
                  title={p.title}
                  excerpt={p.excerpt}
                  featured_image={p.featured_image}
                  category_name={(p.blog_categories as any)?.name}
                  published_at={p.published_at}
                  content={p.content}
                />
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
