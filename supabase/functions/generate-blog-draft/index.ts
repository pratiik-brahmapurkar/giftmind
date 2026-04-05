import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, tone, wordCount } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a blog content writer for GiftMind, a gift recommendation platform. Write in a ${tone} tone. Generate a complete blog post of approximately ${wordCount} words. You must respond with a JSON object using the extract_blog_draft tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Write a blog post about: ${topic}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_blog_draft",
            description: "Return the generated blog post as structured data",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Blog post title" },
                excerpt: { type: "string", description: "Short excerpt under 160 chars" },
                content: { type: "string", description: "Full markdown content" },
                tags: { type: "array", items: { type: "string" }, description: "3-6 relevant tags" },
                metaTitle: { type: "string", description: "SEO meta title under 60 chars" },
                metaDescription: { type: "string", description: "SEO meta description under 160 chars" },
              },
              required: ["title", "excerpt", "content", "tags", "metaTitle", "metaDescription"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_blog_draft" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("generate-blog-draft error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
