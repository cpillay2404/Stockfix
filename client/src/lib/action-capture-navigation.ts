export interface StoreFlowContext {
  store: string;
  rep: string;
  classification: string;
  client?: string;
  scope?: string;
}

export interface ActionCaptureContext extends StoreFlowContext {
  barcode: string;
  returnTo?: string;
}

export interface CaptureReturnNavigation {
  destination: string;
  options: { replace: true };
}

function createSearchParams(values: Record<string, string | undefined>): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  return params;
}

export function buildStoreIssueListUrl({
  store,
  rep,
  classification,
  client,
  scope,
}: StoreFlowContext): string {
  const params = createSearchParams({ store, rep, classification, client, scope });
  return `/store-detail/list?${params.toString()}`;
}

export function buildSkuDetailUrl({
  store,
  rep,
  classification,
  barcode,
  client,
  scope,
  returnTo,
}: ActionCaptureContext): string {
  const params = createSearchParams({
    store,
    rep,
    classification,
    barcode,
    client,
    scope,
    returnTo,
  });
  return `/store-detail/sku?${params.toString()}`;
}

export function buildActionCaptureUrl({
  store,
  rep,
  classification,
  barcode,
  client,
  scope,
  returnTo,
}: ActionCaptureContext): string {
  const params = createSearchParams({
    store,
    rep,
    classification,
    barcode,
    client,
    scope,
    returnTo,
  });
  return `/store-detail/action-capture?${params.toString()}`;
}

function isStoreFlowUrl(url: string): boolean {
  return url === "/store-detail"
    || url.startsWith("/store-detail?")
    || url.startsWith("/store-detail/");
}

export function getCaptureReturnUrl(
  context: StoreFlowContext,
  requestedReturnTo?: string,
): string {
  if (requestedReturnTo && isStoreFlowUrl(requestedReturnTo)) {
    return requestedReturnTo;
  }

  return buildStoreIssueListUrl(context);
}

export function getCaptureReturnNavigation(destination: string): CaptureReturnNavigation {
  return {
    destination,
    // Replacing the capture entry keeps Back in the source store flow rather
    // than exposing an entry path such as the branded splash screen.
    options: { replace: true },
  };
}