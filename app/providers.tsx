// app/providers.tsx
"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";

type Props = {
  children: React.ReactNode;
};

/**
 * Client-only providers.
 * NOTE: Do not import this file into any server-only file other than `app/layout.tsx`.
 */
export default function Providers({ children }: Props) {
  // Don't do anything server-ish here — no `await`, no Prisma, no env reads.
  return <SessionProvider>{children}</SessionProvider>;
}