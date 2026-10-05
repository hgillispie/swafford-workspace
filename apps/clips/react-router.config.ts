import type { Config } from "@react-router/dev/config";

import { PRERENDERED_PUBLIC_PAGE_PATHS } from "./shared/prerendered-public-paths";

const mountedBase =
  // guard:allow-env-credential — workspace mount path, not a secret
  process.env.APP_BASE_PATH ||
  // guard:allow-env-credential — workspace mount path, not a secret
  process.env.VITE_APP_BASE_PATH ||
  "";
const prerenderAtRoot = !mountedBase || mountedBase === "/";

export default {
  appDirectory: "app",
  ssr: true,
  routeDiscovery: { mode: "initial" },
  ...(prerenderAtRoot
    ? { prerender: { paths: () => [...PRERENDERED_PUBLIC_PAGE_PATHS] } }
    : {}),
} satisfies Config;
