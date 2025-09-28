// app/screener/[section]/page.tsx
import { notFound } from "next/navigation";
import ClientScreener from "../ClientScreener";

type Tab = "stocks" | "insider" | "crypto" | "forex";

const pathToTab: Record<string, Tab | undefined> = {
  "stocks": "stocks",
  "insider-activity": "insider",
  "crypto": "crypto",
  "forex": "forex",
};

export default function ScreenerSection({ params }: { params: { section: string } }) {
  const tab = pathToTab[params.section];
  if (!tab) return notFound();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <ClientScreener initialTab={tab} />
    </main>
  );
}