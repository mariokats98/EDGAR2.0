// app/screener/[section]/page.tsx
import { redirect } from "next/navigation";

export default function SectionPage({ params }: { params: { section: string } }) {
  const s = (params.section || "").toLowerCase();
  const allowed = new Set(["stocks", "insider", "crypto", "forex"]);
  const target = allowed.has(s) ? `/screener?tab=${s}` : "/screener";
  redirect(target);
}