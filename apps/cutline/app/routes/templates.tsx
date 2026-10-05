import { IconTemplate } from "@tabler/icons-react";

import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Templates · ${APP_TITLE}` }];
}

export default function TemplatesRoute() {
  return <PagePlaceholder name="Templates" icon={IconTemplate} />;
}
