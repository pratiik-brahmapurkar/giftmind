import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// TODO: Before production, if you add CORS here, restrict Access-Control-Allow-Origin to:
// 'https://giftmind.in' (or your production domain)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    // 1. Fetch published posts
    const { data: posts, error } = await supabaseAdmin
      .from("blog_posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (error) throw error;

    // 2. Build XML
    const domain = "https://giftmind.in";
    
    const staticPages = [
      { path: "/", priority: "1.0", changefreq: "daily" },
      { path: "/blog", priority: "0.9", changefreq: "daily" },
      { path: "/credits", priority: "0.8", changefreq: "weekly" },
      { path: "/privacy-policy", priority: "0.3", changefreq: "monthly" },
      { path: "/terms", priority: "0.3", changefreq: "monthly" },
      { path: "/refund-policy", priority: "0.3", changefreq: "monthly" },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Static pages
    for (const page of staticPages) {
      xml += `
  <url>
    <loc>${domain}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    }

    // Dynamic blog posts
    for (const post of (posts || [])) {
      const date = post.updated_at || post.published_at || new Date().toISOString();
      // ensure proper ISO format
      let formattedDate = date;
      try {
        formattedDate = new Date(date).toISOString().split('T')[0];
      } catch (e) {}

      xml += `
  <url>
    <loc>${domain}/blog/${post.slug}</loc>
    <lastmod>${formattedDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    xml += `
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600"
      },
    });

  } catch (err) {
    console.error("Error generating sitemap:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
});
