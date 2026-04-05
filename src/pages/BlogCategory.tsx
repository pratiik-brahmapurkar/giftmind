import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BlogPostCard from "@/components/blog/BlogPostCard";
import BlogSeo from "@/components/blog/BlogSeo";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

const PAGE_SIZE = 12;

export default function BlogCategory() {
  const { slug } = useParams();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: category } = useQuery({
    queryKey: ["blog-category", slug],
    queryFn: async () => {
      const { data } = await supabase.from("blog_categories").select("*").eq("slug", slug!).single();
      return data;
    },
    enabled: !!slug,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["blog-category-posts", category?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*, blog_categories(name, slug)")
        .eq("status", "published")
        .eq("category_id", category!.id)
        .order("published_at", { ascending: false });
      return data || [];
    },
    enabled: !!category?.id,
  });

  const visible = posts.slice(0, visibleCount);

  if (!category) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Category not found</h1>
          <Button asChild><Link to="/blog">Back to Blog</Link></Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <BlogSeo title={`${category.name} — GiftMind Blog`} description={category.description || undefined} />
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <p className="text-4xl mb-2">{category.icon}</p>
          <h1 className="text-3xl md:text-4xl font-bold font-['Clash_Display',sans-serif]">{category.name}</h1>
          {category.description && <p className="text-muted-foreground mt-2">{category.description}</p>}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {visible.map((p: any) => (
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
        {visible.length === 0 && <p className="text-center text-muted-foreground py-16">No posts in this category yet.</p>}
        {visibleCount < posts.length && (
          <div className="text-center mt-8">
            <Button variant="outline" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>Load more</Button>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
