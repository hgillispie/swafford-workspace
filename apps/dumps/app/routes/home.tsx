import { DumpLibrary } from "@/components/dumps/Library";

const SEO_TITLE = "Dumps";
const SEO_DESCRIPTION =
  "Private file dumps for the workspace. Files upload directly to Backblaze.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
  ];
}

export default function HomeRoute() {
  return <DumpLibrary />;
}
