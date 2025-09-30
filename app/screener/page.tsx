// app/screener/page.tsx
import ClientScreener from "./ClientScreener";

type Props = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default function ScreenerPage({ searchParams }: Props) {
  const raw = (searchParams?.tab ?? "stocks");
  const tab = Array.isArray(raw) ? raw[0] : raw;
  return <ClientScreener initialTab={tab as any} />;
}