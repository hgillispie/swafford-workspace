import { IntelligenceScreen } from "@/components/scout/screens";

const SEO_TITLE = "Scout";
const SEO_DESCRIPTION =
  "TikTok niche pulse, competitor watch, and original-shoot paste packs.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
  ];
}

export default function Home() {
  return <IntelligenceScreen />;
}
