export interface EmbeddedTaskFallbackRequest {
  url: string;
}

interface EmbeddedTaskFallbackOptions {
  store: string;
  isEmbedded: boolean;
  liveOverviewStatus?: number;
}

// A signed embed must never recover from a missing client-specific inventory
// feed by expanding to ALL clients. When live data is genuinely unavailable,
// request the token-scoped task feed instead.
export function getEmbeddedTaskFallbackRequest({
  store,
  isEmbedded,
  liveOverviewStatus,
}: EmbeddedTaskFallbackOptions): EmbeddedTaskFallbackRequest | null {
  if (
    !isEmbedded
    || liveOverviewStatus !== 404
    || !store
  ) {
    return null;
  }

  // The endpoint resolves the client from the signed token, never from a
  // client query string. This remains safe when the page's ordinary UI state
  // is still "ALL".
  const params = new URLSearchParams({ store });
  return { url: `/api/nexus-tasks/pending?${params.toString()}` };
}