const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function proxyFunction(functionName: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("Missing Supabase environment variables", { status: 500 });
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export default async function handler() {
  return proxyFunction("generate-rss");
}
