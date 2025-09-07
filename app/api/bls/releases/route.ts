import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = process.env.BLS_CALENDAR_ICS_URL || "https://www.bls.gov/schedule/news_release/bls.ics";
    const resp = await fetch(url);
    const text = await resp.text();
    // Simplified parse: just return first few lines
    return NextResponse.json({ data: text.split("\n").slice(0,20) });
  } catch (e:any) {
    return NextResponse.json({ error:e.message }, { status:500 });
  }
}
