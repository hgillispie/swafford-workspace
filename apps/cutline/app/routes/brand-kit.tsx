import { IconPalette } from "@tabler/icons-react";

import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Brand kit · ${APP_TITLE}` }];
}

export default function BrandKitRoute() {
  return <PagePlaceholder name="Brand kit" icon={IconPalette} />;
}
