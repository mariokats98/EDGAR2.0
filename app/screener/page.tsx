// app/screener/page.tsx
import ClientScreener from "./ClientScreener";

export default function Page({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  // Pass through first tab value if present so initial render matches URL
  const raw = searchParams?.tab ?? "stocks";
  const tab = Array.isArray(raw) ? raw[0] : raw;
  return <ClientScreener initialTab={tab} />;
}