import { registerRequiredSecret } from "@agent-native/core/secrets";

registerRequiredSecret({
  key: "PULSE_INGEST_SECRET",
  label: "Pulse ingest secret",
  description:
    "Bearer token Brandbot sends when it posts a pulse. Store it in the Dispatch vault. A deploy env var with the same name is also accepted on the unauthenticated ingest request.",
  scope: "workspace",
  kind: "api-key",
  required: false,
  docsUrl: "https://swaffordspeed.com",
});
