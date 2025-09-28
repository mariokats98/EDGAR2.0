import { redirect } from "next/navigation";

export default function ScreenerIndex() {
  // Default route: /screener → /screener/stocks
  redirect("/screener/stocks");
}