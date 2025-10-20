export default function SuccessPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">You’re in 🎉</h1>
      <p className="mt-2 text-gray-600">
        Your subscription is active. Pro features will unlock automatically.
      </p>
      <div className="mt-6">
        <a href="/" className="rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90">
          Back to Home
        </a>
        <a href="/account" className="ml-3 rounded-full border px-5 py-2.5 text-sm hover:bg-gray-50">
          Manage Account
        </a>
      </div>
    </main>
  );
}