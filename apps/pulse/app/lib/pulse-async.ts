/** How long a Pulse read may stay on skeletons before it is shown as an error. */
export const PULSE_QUERY_SETTLE_MS = 4_000;

export function pulseAsyncPhase(input: {
  pending: boolean;
  stalled: boolean;
  isError: boolean;
}): "loading" | "error" | "ready" {
  if (input.isError) return "error";
  if (input.pending && !input.stalled) return "loading";
  if (input.pending) return "error";
  return "ready";
}
