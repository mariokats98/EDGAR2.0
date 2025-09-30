// app/components/SectionHeader.tsx
"use client";

import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;     // optional right-side controls
  icon?: React.ReactNode;      // ✅ optional icon (emoji or component)
};

export default function SectionHeader({ title, subtitle, right, icon }: Props) {
  return (
    <header className="mb-3 flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="text-xl leading-none sm:text-2xl" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="text-lg font-semibold leading-tight text-gray-900 sm:text-xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="sm:ml-4">{right}</div> : null}
    </header>
  );
}