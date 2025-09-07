"use client";
import { useState } from "react";

export default function BLSPage() {
  const [ids, setIds] = useState("CUUR0000SA0,LNS14000000");
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchSeries() {
    setLoading(true);
    try {
      const r = await fetch(`/api/bls/series?ids=${ids}&start=2020&end=2025`);
      const j = await r.json();
      setSeries(j.data || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">BLS Data</h1>
      <div className="flex gap-2 mb-4">
        <input value={ids} onChange={(e)=>setIds(e.target.value)}
          className="border rounded-md px-3 py-2 w-96" />
        <button onClick={fetchSeries} disabled={loading}
          className="bg-black text-white px-4 py-2 rounded-md">{loading ? "Loading…" : "Get series"}</button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {series.map((s,i)=>(
          <div key={i} className="border rounded-lg p-3 bg-white">
            <div className="font-medium">{s.title}</div>
            {s.latest && <div className="text-sm">Latest: {s.latest.date} → {s.latest.value}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
