import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  plugins: {
    disabled: ["integrations", "observational-memory", "sentry", "terminal"],
  },
  app: {
    name: "Cutline",
    sourceTemplate: "chat",
    homePath: "/",
  },
});
