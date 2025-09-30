// app/screener/page.tsx
import ClientScreener from "./ClientScreener";

export default function ScreenerPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
  const raw = searchParams?.tab ?? "stocks";
  const tab = Array.isArray(raw) ? raw[0] : raw; // e.g. "stocks" | "insider" | "crypto" | "congress"
  return <ClientScreener initialTab={tab as any} />;
}