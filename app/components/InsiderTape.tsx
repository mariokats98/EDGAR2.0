// app/components/InsiderTape.tsx
"use client";
import React from "react";

export type TxnType = "ALL" | "A" | "D";

export interface InsiderTapeProps {
  symbol?: string;     // optional so you can pass empty string
  start: string;
  end: string;
  txnType: TxnType;
  /** any string that changes to force refetch/re-render */
  queryKey?: string;
}

// ⬇️ Make sure this is a *default export* and props are typed
export default function InsiderTape({
  symbol = "",
  start,
  end,
  txnType,
  queryKey,
}: InsiderTapeProps) {
  // ... keep your existing component code here ...
  // If your current file already has the full component body,
  // just replace its function signature and export with the block above
  // and leave the rest untouched.
}