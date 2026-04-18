import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openAiKey) {
  throw new Error(
    "Missing required env vars. Expected VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function generateEmbedding(input: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings failed: ${response.status} ${body}`);
  }

  const json = await response.json() as {
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = json.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Embedding response missing vector payload.");
  }

  return `[${embedding.join(",")}]`;
}

async function main() {
  const { data: rules, error } = await supabase
    .from("cultural_rules")
    .select("id, rule_text, context_tags")
    .is("embedding", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const pending = rules ?? [];
  console.log(`Embedding ${pending.length} cultural rules...`);

  for (const rule of pending) {
    const context = (rule.context_tags ?? []).join(", ");
    const sourceText = context
      ? `${rule.rule_text}\nContext tags: ${context}`
      : rule.rule_text;

    const embedding = await generateEmbedding(sourceText);

    const { error: updateError } = await supabase
      .from("cultural_rules")
      .update({
        embedding,
        embedding_model: "text-embedding-3-small",
      })
      .eq("id", rule.id);

    if (updateError) {
      throw updateError;
    }

    console.log(`Embedded ${rule.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
