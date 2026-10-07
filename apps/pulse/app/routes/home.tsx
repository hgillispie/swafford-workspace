import { WeekScreen } from "@/components/pulse/screens";

export function meta() {
  return [
    { title: "Pulse — This week" },
    {
      name: "description",
      content: "This week's Swafford shoot cards and paste packs.",
    },
  ];
}

export default function HomeRoute() {
  return <WeekScreen />;
}
