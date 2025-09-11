// app/components/NewsletterForm.tsx
"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex justify-center">
      <input
        type="email"
        required
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-64 rounded-l-md border px-3 py-2 text-sm focus:outline-none"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-r-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 text-sm"
      >
        {status === "loading" ? "..." : "Subscribe"}
      </button>
      {status === "success" && <p className="ml-3 text-green-600 text-sm">Subscribed!</p>}
      {status === "error" && <p className="ml-3 text-red-600 text-sm">Error. Try again.</p>}
    </form>
  );
}