import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids") || "CUUR0000SA0";
  const start = searchParams.get("start") || "2020";
  const end = searchParams.get("end") || "2025";
  const apiKey = process.env.BLS_API_KEY;

  const resp = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      registrationKey: apiKey,
      startyear: start,
      endyear: end,
      seriesid: ids.split(",").map(s=>s.trim())
    })
  });

  const j = await resp.json();
  const out = (j.Results?.series || []).map((s:any)=>{
    const obs = (s.data||[]).map((d:any)=>({date:`${d.year}-${d.period}`, value:Number(d.value)}));
    return { id:s.seriesID, title:s.seriesID, observations:obs, latest:obs[0] };
  });

  return NextResponse.json({ data: out });
}
