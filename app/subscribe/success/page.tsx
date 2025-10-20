"use client";
import * as React from "react";

export default function SubscribeSuccessPage() {
  const [state, setState] = React.useState<"verifying"|"ok"|"error">("verifying");
  const [msg, setMsg] = React.useState<string>("Verifying your subscription…");
  const [backHref, setBackHref] = React.useState<string>("/");

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const session_id = url.searchParams.get("session_id");
    const from = url.searchParams.get("from") || "/";
    setBackHref(from);

    if (!session_id) {
      setState("error");
      setMsg("Missing session id.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/stripe/verify-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setState("error");
          setMsg(json.error || "Verification failed.");
        } else {
          setState("ok");
          setMsg("You’re all set — Pro unlocked!");
          // Optional: redirect after a short delay
          setTimeout(() => { window.location.href = from; }, 1200);
        }
      } catch (e: any) {
        setState("error");
        setMsg(e?.message || "Unexpected error");
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">Subscription</h1>
      <p className={`mb-6 ${state === "error" ? "text-red-600" : "text-gray-700"}`}>
        {msg}
      </p>
      <a href={backHref} className="rounded-lg border px-4 py-2 text-sm">
        Go back
      </a>
    </main>
  );
}