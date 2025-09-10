// app/game/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BANK = [
  "INFLATION","YIELD","DEFICIT","SURPLUS","GDP","CPI","PPI","PAYROLLS","FED",
  "RATE","TAPER","RECESSION","EARNINGS","DIVIDEND","MARGIN","DEMAND","SUPPLY",
  "TARIFF","EXPORT","IMPORT","CAPITAL","VOLATILITY","BETA","ALPHA","BOND",
  "PRIMARY","SECONDARY","LIQUIDITY","CREDIT","SPREAD","DURATION","HEDGE","SHORT",
  "LONG","INDEX","FUTURES","OPTION","DELTA","GAMMA","EPS","REVENUE","BUYBACK",
  "LEVERAGE","DEBT","CASHFLOW","TREASURY","STIMULUS","BALANCE","SURVEY","HOUSING",
  "RETAIL","LABOR","UNEMPLOYMENT","PRIVATE","PUBLIC","IPO","MERGER","ACQUISITION",
];

function pickWord(seed: number) {
  const idx = seed % BANK.length;
  return BANK[idx];
}
function randSeed() {
  return Math.floor(Math.random() * 10_000_000);
}

export default function GuessonomicsPage() {
  const [seed, setSeed] = useState<number>(() => randSeed());
  const target = useMemo(() => pickWord(seed), [seed]);

  const [guess, setGuess] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [status, setStatus] = useState<"playing"|"won"|"lost">("playing");
  const inputRef = useRef<HTMLInputElement>(null);

  const maxGuesses = 6;

  useEffect(() => {
    setGuess("");
    setHistory([]);
    setStatus("playing");
    inputRef.current?.focus();
  }, [target]);

  function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    const g = guess.trim().toUpperCase();
    if (!g) return;
    if (!/^[A-Z]+$/.test(g)) return;

    const next = [...history, g];
    setHistory(next);
    setGuess("");

    if (g === target) {
      setStatus("won");
    } else if (next.length >= maxGuesses) {
      setStatus("lost");
    }
  }

  function score(guess: string) {
    const res: ("correct"|"present"|"absent")[] = [];
    const freq: Record<string, number> = {};
    for (const ch of target) freq[ch] = (freq[ch] ?? 0) + 1;
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === target[i]) {
        res[i] = "correct";
        freq[guess[i]] -= 1;
      }
    }
    for (let i = 0; i < guess.length; i++) {
      if (res[i]) continue;
      const ch = guess[i];
      if (freq[ch] > 0) {
        res[i] = "present";
        freq[ch] -= 1;
      } else {
        res[i] = "absent";
      }
    }
    return res;
  }

  function color(cl: "correct"|"present"|"absent") {
    switch (cl) {
      case "correct": return "bg-emerald-500 text-white border-emerald-500";
      case "present": return "bg-amber-500 text-white border-amber-500";
      default: return "bg-gray-200 text-gray-800 border-gray-200";
    }
  }

  const remaining = maxGuesses - history.length;
  const gameOver = status !== "playing";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* Brand header */}
      <div className="mb-8 flex items-center gap-3">
        <img src="/guessonomics-logo.svg" alt="Guessonomics" className="h-10 w-auto" />
        <div className="hidden sm:block text-sm text-gray-500">
          Where economics meets wordplay.
        </div>
      </div>

      {/* Card */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">Guessonomics</h1>
          <button
            onClick={() => setSeed(randSeed())}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm shadow hover:opacity-95"
          >
            🔁 New Round
          </button>
        </div>
        <p className="mt-1 text-gray-600">
          Guess the hidden econ/finance term in {maxGuesses} tries.
        </p>

        {/* Board */}
        <div className="mt-6 grid gap-2">
          {history.map((g, i) => {
            const fb = score(g);
            return (
              <div key={i} className="flex gap-2 justify-center">
                {g.split("").map((ch, j) => (
                  <div
                    key={j}
                    className={`h-12 w-10 grid place-content-center rounded-md border text-lg font-bold ${color(fb[j])}`}
                  >
                    {ch}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Empty rows */}
          {Array.from({ length: remaining }).map((_, idx) => (
            <div key={`empty-${idx}`} className="flex gap-2 justify-center opacity-30">
              {target.split("").slice(0, Math.min(7, target.length)).map((_, j) => (
                <div key={j} className="h-12 w-10 grid place-content-center rounded-md border bg-gray-50" />
              ))}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={submitGuess} className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            ref={inputRef}
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Type your guess (letters only)…"
            maxLength={12}
            className="w-full rounded-md border px-4 py-2"
            disabled={gameOver}
          />
          <button
            type="submit"
            disabled={gameOver}
            className="whitespace-nowrap rounded-md bg-black text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
          >
            Submit
          </button>
        </form>

        {/* Status */}
        <div className="mt-4">
          {status === "playing" && (
            <div className="text-sm text-gray-600">
              {remaining} {remaining === 1 ? "try" : "tries"} left.
            </div>
          )}
          {status === "won" && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 text-sm">
              🎉 Nice! The word was <b>{target}</b>.
            </div>
          )}
          {status === "lost" && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-800 text-sm">
              😅 Close! The word was <b>{target}</b>.
            </div>
          )}
        </div>
      </section>

      <p className="mt-6 text-xs text-gray-500">
        Colors: <span className="font-medium text-emerald-600">Green</span> = correct spot,{" "}
        <span className="font-medium text-amber-600">Yellow</span> = wrong spot, Gray = not in word.
      </p>
    </main>
  );
}