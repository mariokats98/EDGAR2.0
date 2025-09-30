// app/screener/[section]/page.tsx
import ClientScreener from "../ClientScreener";

export default function SectionPage({
  params,
}: {
  params: { section?: string };
}) {
  const section = (params?.section || "stocks").toLowerCase();
  return <ClientScreener initialTab={section} />;
}