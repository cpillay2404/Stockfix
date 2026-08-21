export interface EmbeddedTaskFallbackRequest {
  url: string;
}

export const SYNDICATED_CLIENT_UNAVAILABLE_ERROR =
  "Client is not available for this syndicated store view";

interface EmbeddedTaskFallbackOptions {
  store: string;
  isEmbedded: boolean;
  liveOverviewStatus?: number;
  liveOverviewError?: string;
}

// A signed embed must never recover from a missing client-specific inventory
// feed by expanding to ALL clients. When live data is genuinely unavailable,
// request the token-scoped task feed instead.
export function getEmbeddedTaskFallbackRequest({
  store,
  isEmbedded,
  liveOverviewStatus,
  liveOverviewError,
}: EmbeddedTaskFallbackOptions): EmbeddedTaskFallbackRequest | null {
  const unavailableLiveOverview =
    liveOverviewStatus === 404
    || (
      liveOverviewStatus === 403
      && liveOverviewError === SYNDICATED_CLIENT_UNAVAILABLE_ERROR
    );

  if (
    !isEmbedded
    || !unavailableLiveOverview
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