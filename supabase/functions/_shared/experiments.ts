export async function getServerExperimentVariant(
  userId: string,
  experimentKey: string,
  userProperties: Record<string, unknown> = {},
): Promise<string | boolean | undefined> {
  const apiKey = Deno.env.get("POSTHOG_API_KEY");
  if (!apiKey) return undefined;

  const host = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";
  const response = await fetch(`${host.replace(/\/$/, "")}/decide/?v=3`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      distinct_id: userId,
      person_properties: userProperties,
      groups: {},
    }),
  });

  if (!response.ok) {
    console.error("PostHog feature flag evaluation failed:", response.status);
    return undefined;
  }

  const payload = await response.json();
  const flag = payload?.featureFlags?.[experimentKey];
  return typeof flag === "string" || typeof flag === "boolean" ? flag : undefined;
}
