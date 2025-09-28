// app/screener/page.tsx
import { redirect } from "next/navigation";

export default function ScreenerIndex() {
  // Default: /screener → /screener/stocks
  redirect("/screener/stocks");
}