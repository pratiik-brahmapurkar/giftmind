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
    const { data: posts, error } = await supabaseAdmin
      .from("blog_posts")
      .select("title, slug, excerpt, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const domain = "https://giftmind.in";
    const now = new Date().toUTCString();

    let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>GiftMind Blog</title>
  <link>${domain}/blog</link>
  <description>Gift ideas, guides, and thoughtful giving recommendations.</description>
  <language>en-us</language>
  <lastBuildDate>${now}</lastBuildDate>
  <atom:link href="${domain}/api/rss" rel="self" type="application/rss+xml" />`;

    for (const post of (posts || [])) {
      const pubDate = new Date(post.published_at || new Date()).toUTCString();
      const escapedTitle = (post.title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const escapedExcerpt = (post.excerpt || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      xml += `
  <item>
    <title>${escapedTitle}</title>
    <link>${domain}/blog/${post.slug}</link>
    <guid>${domain}/blog/${post.slug}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escapedExcerpt}</description>
  </item>`;
    }

    xml += `
</channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml",
        "Cache-Control": "public, max-age=3600"
      },
    });

  } catch (err) {
    console.error("Error generating RSS feed:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
});
