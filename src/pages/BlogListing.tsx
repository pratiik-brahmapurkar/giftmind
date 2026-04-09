import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import BlogPostCard from "@/components/blog/BlogPostCard";
import { SEOHead } from "@/components/common/SEOHead";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

const PAGE_SIZE = 12;

export default function BlogListing() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["public-blog-posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*, blog_categories(name, slug)")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      return data || [];
    },
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["public-blog-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("blog_categories").select("*").order("sort_order");
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (selectedCategory === "all") return posts;
    return posts.filter((p: any) => p.category_id === selectedCategory);
  }, [posts, selectedCategory]);

  const visible = filtered.slice(0, visibleCount);
  const isLoading = postsLoading || categoriesLoading;

  const popularPosts = useMemo(() => [...posts].sort((a: any, b: any) => (b.views || 0) - (a.views || 0)).slice(0, 5), [posts]);

  const tagCloud = useMemo(() => {
    const map: Record<string, number> = {};
    posts.forEach((p: any) => (p.tags || []).forEach((t: string) => { map[t] = (map[t] || 0) + 1; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [posts]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="Blog — Gift Ideas & Guides"
        description="Gift ideas, guides, and the psychology of thoughtful giving. Cultural tips for Diwali, Christmas, Eid, and every occasion."
        keywords={['gift ideas', 'gift guide', 'what to gift', 'gifting tips']}
      />
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold font-['Clash_Display',sans-serif]">The GiftMind Blog</h1>
          <p className="text-muted-foreground mt-3 text-lg">Gift ideas, guides, and the psychology of thoughtful giving</p>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-8 snap-x scrollbar-none">
          <button
            onClick={() => { setSelectedCategory("all"); setVisibleCount(PAGE_SIZE); }}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium snap-start transition-colors ${selectedCategory === "all" ? "bg-primary text-primary-foreground" : "border border-muted-foreground/30 text-muted-foreground hover:border-primary/50"}`}
          >
            All
          </button>
          {categories.map((c: any) => (
            <button
              key={c.id}
              onClick={() => { setSelectedCategory(c.id); setVisibleCount(PAGE_SIZE); }}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium snap-start transition-colors ${selectedCategory === c.id ? "bg-primary text-primary-foreground" : "border border-muted-foreground/30 text-muted-foreground hover:border-primary/50"}`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="flex gap-8">
          {/* Post grid */}
          <div className="flex-1">
            <div className="grid md:grid-cols-2 gap-6">
              {isLoading
                ? [1, 2, 3, 4].map((idx) => (
                    <Card key={idx}>
                      <Skeleton className="h-48 w-full rounded-t-xl rounded-b-none" />
                      <CardContent className="space-y-3 p-4">
                        <Skeleton className="h-4 w-1/3 rounded-md" />
                        <Skeleton className="h-6 w-5/6 rounded-md" />
                        <Skeleton className="h-4 w-full rounded-md" />
                        <Skeleton className="h-4 w-4/5 rounded-md" />
                      </CardContent>
                    </Card>
                  ))
                : visible.map((p: any) => (
                    <BlogPostCard
                      key={p.id}
                      slug={p.slug}
                      title={p.title}
                      excerpt={p.excerpt}
                      featured_image={p.featured_image}
                      category_name={(p.blog_categories as any)?.name}
                      category_slug={(p.blog_categories as any)?.slug}
                      published_at={p.published_at}
                      content={p.content}
                    />
                  ))}
            </div>
            {!isLoading && visible.length === 0 && (
              <p className="text-center text-muted-foreground py-16">No posts yet. Check back soon!</p>
            )}
            {!isLoading && visibleCount < filtered.length && (
              <div className="text-center mt-8">
                <Button variant="outline" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>Load more</Button>
              </div>
            )}
          </div>

          {/* Sidebar — desktop only */}
          <aside className="hidden lg:block w-72 shrink-0 space-y-6 sticky top-24 self-start">
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Popular Posts</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2">
                {popularPosts.map((p: any, i: number) => (
                  <Link key={p.id} to={`/blog/${p.slug}`} className="flex gap-2 text-sm hover:text-primary transition-colors">
                    <span className="text-muted-foreground font-bold">{i + 1}.</span>
                    <span className="line-clamp-2">{p.title}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-5 text-center space-y-2">
                <p className="font-bold">Need a gift idea right now?</p>
                <p className="text-xs text-muted-foreground">Get personalized recommendations in 60 seconds</p>
                <Button size="sm" asChild>
                  <Link to="/gift-flow">Start Free <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
                </Button>
              </CardContent>
            </Card>

            {tagCloud.length > 0 && (
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Tags</CardTitle></CardHeader>
                <CardContent className="pt-0 flex flex-wrap gap-1.5">
                  {tagCloud.map(([tag, count]) => (
                    <span
                      key={tag}
                      className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs"
                      style={{ fontSize: `${Math.min(14, 10 + count)}px` }}
                    >
                      {tag}
                    </span>
                  ))}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
