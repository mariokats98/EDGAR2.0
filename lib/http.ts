// lib/http.ts
import { headers } from "next/headers";

const DEFAULT_TIMEOUT_MS = 15000;

export function withTimeout<T>(p: Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Request timeout after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
  });
}

// Build absolute base URL (server → server)
export function getBaseUrl(req?: Request) {
  const h = req ? Object.fromEntries(req.headers as any) : Object.fromEntries(headers().entries());
  const proto = h["x-forwarded-proto"] || "https";
  const host = h["x-forwarded-host"] || h.host;
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL; // e.g. https://yourdomain.vercel.app
  return envUrl || `${proto}://${host}`;
}

export async function httpJSON<T = any>(url: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const r = await withTimeout(fetch(url, {
    ...init,
    headers: {
      "accept": "application/json",
      "user-agent": process.env.SEC_USER_AGENT || "herevna.ai (contact@: set SEC_USER_AGENT)",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  }), timeoutMs);

  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg += ` ${JSON.stringify(j)}`;
    } catch {
      msg += ` ${await r.text().catch(() => "")}`;
    }
    throw new Error(`HTTP ${msg}`);
  }
  try {
    return await r.json() as T;
  } catch {
    throw new Error("Invalid JSON response");
  }
}