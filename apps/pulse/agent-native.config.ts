import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  runtime: {
    environment: { required: ["PULSE_INGEST_ORG_ID"] },
  },
});
