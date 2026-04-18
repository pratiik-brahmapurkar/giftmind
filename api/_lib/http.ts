function readHeader(
  request: Request | { headers?: Headers | Record<string, string | string[] | undefined> },
  name: string,
) {
  const headers = request.headers;
  if (!headers) return null;

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  if (Array.isArray(direct)) {
    return direct[0] ?? null;
  }
  return typeof direct === "string" ? direct : null;
}

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function getBearerToken(request: Request) {
  const authorization = readHeader(request, "authorization") || readHeader(request, "Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
}

export function getInternalRecommendationWorkerSecret(request: Request) {
  const header = readHeader(request, "x-recommendation-worker-secret");
  return header?.trim() || null;
}

export function hasInternalRecommendationWorkerAccess(request: Request) {
  const configuredSecret = process.env.RECOMMENDATION_WORKER_SECRET;
  if (!configuredSecret) return false;
  return getInternalRecommendationWorkerSecret(request) === configuredSecret;
}

export async function readJson<TBody>(request: Request) {
  return request.json() as Promise<TBody>;
}
