// Shared helper for product webhook payloads. Product topics deliver the
// REST-shaped product JSON; `admin_graphql_api_id` carries the GID, and the
// delete topic sends only a numeric `id`.

export function productGidFromPayload(
  payload: Record<string, unknown>,
): string | null {
  const gid = payload.admin_graphql_api_id;
  if (typeof gid === "string" && gid.startsWith("gid://")) return gid;
  if (payload.id != null) return `gid://shopify/Product/${payload.id}`;
  return null;
}
