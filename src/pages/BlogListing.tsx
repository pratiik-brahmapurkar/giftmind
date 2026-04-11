import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/common/SEOHead";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BlogPostCard from "@/components/blog/BlogPostCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export default function BlogListing() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [page, setPage] = useState(1);

  const { data: categories = [] } = useQuery({
    queryKey: ["blog-categories-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_categories")
        .select("id, name, slug")
        .order("sort_order");

      if (error) throw error;
      return data || [];
    },
  });

  const { data: postsResult, isLoading } = useQuery({
    queryKey: ["blog-listing", selectedCategory, page],
    queryFn: async () => {
      let query = supabase
        .from("blog_posts")
        .select(
          "id, title, slug, excerpt, content, featured_image_url, featured_image_alt, published_at, category_id, blog_categories(name, slug)",
          { count: "exact" },
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .range(0, page * PAGE_SIZE - 1);

      if (selectedCategory !== "all") {
        query = query.eq("category_id", selectedCategory);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return { posts: data || [], count: count || 0 };
    },
  });

  const posts = postsResult?.posts || [];
  const count = postsResult?.count || 0;
  const hasMore = posts.length < count;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_22%,#f8fafc_100%)]">
      <SEOHead
        title="The GiftMind Blog"
        description="Gift ideas, guides, and the psychology of thoughtful giving."
        keywords={["gift ideas", "gift guides", "festival gifting", "relationship gifting", "budget gifts"]}
      />
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[36px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.14),rgba(255,255,255,1)_40%),linear-gradient(135deg,rgba(14,165,233,0.06),rgba(236,72,153,0.08),rgba(255,255,255,1))] px-6 py-10 shadow-sm sm:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary/70">GiftMind Editorial</p>
            <h1 className="mt-3 font-['Clash_Display',sans-serif] text-4xl leading-tight text-slate-950 sm:text-5xl">
              The GiftMind Blog
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Gift ideas, practical guides, and the psychology of thoughtful giving for every occasion.
            </p>
          </div>
        </section>

        <section className="mt-8 flex gap-3 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              setPage(1);
            }}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
              selectedCategory === "all"
                ? "border-primary bg-primary text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary",
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setSelectedCategory(category.id);
                setPage(1);
              }}
              className={cn(
                "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
                selectedCategory === category.id
                  ? "border-primary bg-primary text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary",
              )}
            >
              {category.name}
            </button>
          ))}
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                  <Skeleton className="aspect-[16/10] w-full rounded-[20px]" />
                  <Skeleton className="mt-4 h-4 w-28 rounded-full" />
                  <Skeleton className="mt-3 h-8 w-4/5 rounded-xl" />
                  <Skeleton className="mt-3 h-16 w-full rounded-xl" />
                </div>
              ))
            : posts.map((post) => (
                <BlogPostCard
                  key={post.id}
                  slug={post.slug}
                  title={post.title}
                  excerpt={post.excerpt}
                  featuredImageUrl={post.featured_image_url}
                  featuredImageAlt={post.featured_image_alt}
                  categoryName={(post.blog_categories as { name?: string } | null)?.name || null}
                  publishedAt={post.published_at}
                  content={post.content}
                />
              ))}
        </section>

        {!isLoading && posts.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-16 text-center text-slate-500">
            No published posts yet.
          </div>
        ) : null}

        {hasMore ? (
          <div className="mt-10 flex justify-center">
            <Button variant="outline" className="rounded-full px-6" onClick={() => setPage((current) => current + 1)}>
              Load More
            </Button>
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
