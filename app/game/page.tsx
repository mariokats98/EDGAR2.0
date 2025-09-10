"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** -------------------------
 *  ECONWORD (Wordle-style)
 *  Drop-in Next.js client page
 *  -------------------------
 */

type CellState = "idle" | "correct" | "present" | "absent";
type Phase = "playing" | "won" | "lost";

const ROWS = 6;
const COLS = 5;

// Curated 5-letter econ/finance words (uppercased)
const WORDS: string[] = [
  "YIELD","BONDS","INDEX","EQUITY","DELTA".slice(0,5),"ALPHA",
  "VALUE","FLOAT","MONEY","CAPEX",
  "CARRY","TREND","DELIV".slice(0,5),"GROSS","MARGE".slice(0,5),
  "SPEND","PRICE","CPIES".slice(0,5),"RATES","CASHY".slice(0,5),
  "LEVER".slice(0,5),"RALLY","SHORT","STACK".slice(0,5),"DELIV".slice(0,5),
  "RENTS","HOUSY".slice(0,5),"WAGES","INPUT".slice(0,5),"CLOUD".slice(0,5),
  "BRENT","WTIXX".slice(0,5),"METAL".slice(0,5),"COPPR".slice(0,5),
  "GOLDS".slice(0,5),"SILVR".slice(0,5),"NIKKE".slice(0,5),"ASSET",
  "RISKY".slice(0,5),"BIDAS".slice(0,5),"ASKED","SPXEW".slice(0,5),
  "EPSGA".slice(0,5),"CYCLE","EARNX".slice(0,5),"BULLS","BEARS",
  "DELTA","GAMMA","OMEGA","BASIS","ALPHA",
  "FUTUR".slice(0,5),"REITS","COVER","SWAPS","AGGRO".slice(0,5),
  "AUDIT","FLOAT","DEBTS","CAVEN".slice(0,5),"CLOBO".slice(0,5),
].map(w => w.padEnd(5, "X")).map(w => w.slice(0,5)); // ensure 5 chars

// Filter to keep only A-Z words, replace any X padding with reasonable letters
const CLEAN_WORDS = Array.from(
  new Set(
    WORDS.map(w =>
      w
        .toUpperCase()
        .replace(/[^A-Z]/g, "A")
    )
  )
).filter(w => w.length === 5);

// Pretty gradient classes for background + UI accents
const GRADIENT_BG =
  "bg-[radial-gradient(1200px_600px_at_20%_-10%,#eef2ff_0%,transparent_60%),radial-gradient(1200px_800px_at_120%_10%,#e0f2fe_0%,transparent_60%)]";

export default function EconWordPage() {
  // --------- state ----------
  const [solution, setSolution] = useState<string>(() => pickRandom());
  const [guesses, setGuesses] = useState<string[]>([]); // committed guesses
  const [current, setCurrent] = useState<string>("");   // typing row
  const [phase, setPhase] = useState<Phase>("playing");
  const [usedLetters, setUsedLetters] = useState<Record<string, CellState>>({});
  const [shakeRowIndex, setShakeRowIndex] = useState<number | null>(null);
  const [revealRowIndex, setRevealRowIndex] = useState<number | null>(null);

  // avoid picking the same solution twice in a row
  const lastSolutionRef = useRef(solution);

  // build board rows (guessed rows + current row + empty rows)
  const board = useMemo(() => {
    const rows: string[] = [...guesses];
    if (phase === "playing") rows.push(current);
    while (rows.length < ROWS) rows.push("");
    return rows.slice(0, ROWS);
  }, [guesses, current, phase]);

  // derive colored states for each committed guess
  const evaluations = useMemo(() => {
    return guesses.map(g => evaluateGuess(g, solution));
  }, [guesses, solution]);

  // update keyboard coloring map
  useEffect(() => {
    const map: Record<string, CellState> = { ...usedLetters };
    evaluations.forEach(row => {
      row.forEach(({ letter, state }) => {
        const prev = map[letter];
        if (!prev) map[letter] = state;
        else {
          // promote: idle < absent < present < correct
          const rank = { idle: 0, absent: 1, present: 2, correct: 3 } as const;
          if (rank[state] > rank[prev]) map[letter] = state;
        }
      });
    });
    setUsedLetters(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guesses, solution]);

  // handle physical keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (phase !== "playing") return;
      const key = e.key.toUpperCase();

      if (/^[A-Z]$/.test(key)) {
        if (current.length < COLS) setCurrent(c => c + key);
      } else if (key === "BACKSPACE") {
        setCurrent(c => c.slice(0, -1));
      } else if (key === "ENTER") {
        onEnter();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, phase, guesses, solution]);

  const onEnter = useCallback(() => {
    if (phase !== "playing") return;
    if (current.length !== COLS) {
      // shake
      setShakeRowIndex(guesses.length);
      setTimeout(() => setShakeRowIndex(null), 500);
      return;
    }

    // Accept any 5-letter a-z string; optionally gate by dictionary.
    const guess = current.toUpperCase();

    const nextGuesses = [...guesses, guess];
    setGuesses(nextGuesses);
    setCurrent("");

    // trigger reveal animation
    setRevealRowIndex(nextGuesses.length - 1);
    setTimeout(() => setRevealRowIndex(null), 1200);

    if (guess === solution) {
      setTimeout(() => setPhase("won"), 300);
      return;
    }
    if (nextGuesses.length >= ROWS) {
      setTimeout(() => setPhase("lost"), 300);
    }
  }, [current, guesses, phase, solution]);

  function onPress(char: string) {
    if (phase !== "playing") return;
    if (char === "ENTER") return onEnter();
    if (char === "DEL") return setCurrent(c => c.slice(0, -1));
    if (/^[A-Z]$/.test(char) && current.length < COLS) {
      setCurrent(c => c + char);
    }
  }

  function newGame() {
    let next = pickRandom();
    // prevent immediate repeat
    if (next === lastSolutionRef.current && CLEAN_WORDS.length > 1) {
      // pick until different (bounded loop)
      for (let i = 0; i < 10; i++) {
        const alt = pickRandom();
        if (alt !== lastSolutionRef.current) {
          next = alt;
          break;
        }
      }
    }
    lastSolutionRef.current = next;
    setSolution(next);
    setGuesses([]);
    setCurrent("");
    setUsedLetters({});
    setPhase("playing");
    setShakeRowIndex(null);
    setRevealRowIndex(null);
  }

  const shareText = useMemo(() => {
    const rows = guesses.map(g => {
      const ev = evaluateGuess(g, solution);
      return ev
        .map(c => (c.state === "correct" ? "🟩" : c.state === "present" ? "🟨" : "⬛"))
        .join("");
    });
    const header = phase === "won"
      ? `EconWord ${guesses.length}/${ROWS}`
      : `EconWord X/${ROWS}`;
    return `${header}\n${rows.join("\n")}`;
  }, [guesses, solution, phase]);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareText);
      alert("Result copied! Paste it anywhere ✨");
    } catch {
      alert("Could not copy, sorry!");
    }
  }

  // -------------- UI --------------
  return (
    <div className={`min-h-screen ${GRADIENT_BG}`}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            EconWord
          </h1>
          <button
            onClick={newGame}
            className="rounded-full border px-3 py-1.5 text-sm hover:bg-white/70 bg-white/60 backdrop-blur shadow"
          >
            ↻ Play again
          </button>
        </header>

        <p className="text-sm text-gray-600 mb-4">
          Guess the 5-letter <span className="font-medium">economic/finance</span> term in {ROWS} tries.  
          Letters flip to show: <span className="text-green-600 font-medium">correct</span>,{" "}
          <span className="text-yellow-600 font-medium">present</span>, or{" "}
          <span className="text-gray-500 font-medium">absent</span>.
        </p>

        {/* board */}
        <div className="mx-auto grid gap-2 w-full max-w-md">
          {board.map((word, r) => {
            const committed = r < guesses.length;
            const rowEval = committed ? evaluations[r] : null;
            const isCurrent = r === guesses.length && phase === "playing";
            return (
              <Row
                key={r}
                word={word}
                evals={rowEval}
                isCurrent={isCurrent}
                shake={shakeRowIndex === r}
                reveal={revealRowIndex === r}
              />
            );
          })}
        </div>

        {/* keyboard */}
        <div className="mt-6">
          <Keyboard used={usedLetters} onPress={onPress} />
        </div>
      </div>

      {/* MODAL */}
      {phase !== "playing" && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg p-5 text-center">
            {phase === "won" ? (
              <>
                <div className="text-2xl">🎉 Nice!</div>
                <div className="mt-1 text-gray-700">
                  You solved it in <b>{guesses.length}</b> {guesses.length === 1 ? "try" : "tries"}.
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl">🤔 Good effort!</div>
                <div className="mt-1 text-gray-700">
                  The word was <b>{solution}</b>.
                </div>
              </>
            )}
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={copyShare}
                className="rounded-full bg-black text-white px-4 py-2 text-sm hover:opacity-90"
              >
                Copy result
              </button>
              <button
                onClick={newGame}
                className="rounded-full border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Play again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Row & Cell ---------------- */

function Row({
  word,
  evals,
  isCurrent,
  shake,
  reveal,
}: {
  word: string;
  evals: { letter: string; state: CellState }[] | null;
  isCurrent?: boolean;
  shake?: boolean;
  reveal?: boolean;
}) {
  const letters = [...word.padEnd(COLS)];
  return (
    <div
      className={`grid grid-cols-5 gap-2 ${shake ? "animate-[shake_0.5s]" : ""}`}
      style={{ ["--tw-shadow-color" as any]: "rgba(0,0,0,0.08)" }}
    >
      {letters.map((ch, i) => {
        const letter = ch.trim().toUpperCase();
        let state: CellState = "idle";
        if (evals) state = evals[i].state;
        const filled = isCurrent && letter !== "";
        return (
          <Cell
            key={i}
            letter={letter}
            state={state}
            filled={filled}
            index={i}
            reveal={reveal}
          />
        );
      })}
      <style jsx global>{`
        @keyframes flip {
          0% { transform: rotateX(0); }
          50% { transform: rotateX(90deg); }
          100% { transform: rotateX(0); }
        }
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}

function Cell({
  letter,
  state,
  filled,
  index,
  reveal,
}: {
  letter: string;
  state: CellState;
  filled?: boolean;
  index: number;
  reveal?: boolean;
}) {
  const bg =
    state === "correct"
      ? "bg-green-500 text-white border-green-500"
      : state === "present"
      ? "bg-yellow-500 text-white border-yellow-500"
      : state === "absent"
      ? "bg-gray-300 text-white border-gray-300"
      : "bg-white/80";

  const animate =
    reveal && state !== "idle"
      ? "animate-[flip_0.6s_ease] origin-bottom delay-[var(--d)]"
      : filled
      ? "animate-[pop_0.12s_ease]"
      : "";

  return (
    <div
      className={`h-14 rounded-xl border text-xl font-semibold grid place-items-center shadow-sm ${bg} ${animate}`}
      style={{ ["--d" as any]: `${index * 120}ms` }}
    >
      {letter || ""}
    </div>
  );
}

/* ---------------- Keyboard ---------------- */

const ROW1 = "QWERTYUIOP".split("");
const ROW2 = "ASDFGHJKL".split("");
const ROW3 = ["ENTER", ..."ZXCVBNM".split(""), "DEL"];

function Keyboard({
  used,
  onPress,
}: {
  used: Record<string, CellState>;
  onPress: (ch: string) => void;
}) {
  function keyClass(k: string) {
    const state = used[k];
    if (k === "ENTER" || k === "DEL")
      return "px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md bg-black text-white";
    if (state === "correct") return "rounded-md px-2 sm:px-3 py-2 bg-green-500 text-white";
    if (state === "present") return "rounded-md px-2 sm:px-3 py-2 bg-yellow-500 text-white";
    if (state === "absent") return "rounded-md px-2 sm:px-3 py-2 bg-gray-300 text-white";
    return "rounded-md px-2 sm:px-3 py-2 bg-white/80";
  }

  return (
    <div className="select-none">
      <div className="flex justify-center gap-1 mb-1">{ROW1.map(k => (
        <button key={k} onClick={() => onPress(k)} className={keyClass(k)}>{k}</button>
      ))}</div>
      <div className="flex justify-center gap-1 mb-1">{ROW2.map(k => (
        <button key={k} onClick={() => onPress(k)} className={keyClass(k)}>{k}</button>
      ))}</div>
      <div className="flex justify-center gap-1">{ROW3.map(k => (
        <button key={k} onClick={() => onPress(k)} className={keyClass(k)}>{k}</button>
      ))}</div>
    </div>
  );
}

/* --------------- helpers --------------- */

function evaluateGuess(guess: string, solution: string) {
  const res: { letter: string; state: CellState }[] = [];
  const solChars = solution.split("");
  const taken = Array(COLS).fill(false);

  // first pass: correct
  for (let i = 0; i < COLS; i++) {
    const g = guess[i];
    if (g === solution[i]) {
      res[i] = { letter: g, state: "correct" };
      taken[i] = true;
    } else {
      res[i] = { letter: g, state: "idle" };
    }
  }
  // second: present
  for (let i = 0; i < COLS; i++) {
    if (res[i].state === "correct") continue;
    const g = guess[i];
    let found = -1;
    for (let j = 0; j < COLS; j++) {
      if (!taken[j] && solChars[j] === g) {
        found = j;
        break;
      }
    }
    res[i].state = found >= 0 ? "present" : "absent";
    if (found >= 0) taken[found] = true;
  }
  return res;
}

function pickRandom(): string {
  const i = Math.floor(Math.random() * CLEAN_WORDS.length);
  return CLEAN_WORDS[i];
}