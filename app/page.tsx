export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Herevna.io</h1>
      <p className="text-gray-600 mt-2">EDGAR & BLS Aggregator</p>
      <div className="mt-6 flex gap-3">
        <a className="px-4 py-2 bg-black text-white rounded-md" href="/edgar">Explore EDGAR</a>
        <a className="px-4 py-2 border rounded-md" href="/bls">Explore BLS</a>
      </div>
    </div>
  );
}
