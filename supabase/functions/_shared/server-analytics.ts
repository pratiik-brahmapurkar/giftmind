export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
) {
  const apiKey = Deno.env.get("POSTHOG_API_KEY");
  if (!apiKey) return;

  const host = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";
  try {
    const response = await fetch(`${host.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties,
      }),
    });

    if (!response.ok) {
      console.error("PostHog server capture failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("PostHog server capture error:", error instanceof Error ? error.message : String(error));
  }
}
