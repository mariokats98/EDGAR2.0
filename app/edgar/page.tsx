"use client";
import { useState } from "react";

export default function EdgarPage() {
  const [input, setInput] = useState("");
  const [filings, setFilings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchFilings() {
    if (!input) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/lookup/${input}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Lookup failed");
      const cik = j.cik;
      const resp = await fetch(`/api/filings/${cik}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Filings fetch failed");
      setFilings(data);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">EDGAR Filings</h1>
      <div className="flex gap-2 mb-4">
        <input value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Ticker, CIK, or Name"
          className="border rounded-md px-3 py-2 w-80" />
        <button onClick={fetchFilings} disabled={loading}
          className="bg-black text-white px-4 py-2 rounded-md">{loading ? "Loading…" : "Get"}</button>
      </div>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {filings.map((f,i)=>(
          <div key={i} className="border rounded-lg p-3 bg-white">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{f.filed_at}</span><span>{f.form}</span>
            </div>
            <div className="mt-1 font-medium">{f.title}</div>
            {f.badges?.length>0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {f.badges.map((b:string,idx:number)=>(<span key={idx} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{b}</span>))}
              </div>
            )}
            {f.amount_usd && (
              <div className="mt-1 text-xs text-gray-700">Amount: ${f.amount_usd.toLocaleString()}</div>
            )}
            <a href={f.primary_doc_url} target="_blank" className="text-xs text-blue-600 mt-2 block">Primary Doc</a>
          </div>
        ))}
      </div>
    </div>
  );
}
