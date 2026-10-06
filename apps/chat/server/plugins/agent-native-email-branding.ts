import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: {
    name: "Chat",
    sourceTemplate: "chat",
    homePath: "/home",
  },
});
