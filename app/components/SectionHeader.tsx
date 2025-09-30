// app/components/SectionHeader.tsx
"use client";

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode; // optional right-side controls (filters/search, etc.)
};

export default function SectionHeader({ title, subtitle, right }: Props) {
  return (
    <header className="mb-3 flex flex-col gap-2 rounded-xl border bg-white px-4 py-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold leading-tight text-gray-900 sm:text-xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="sm:ml-4">{right}</div> : null}
    </header>
  );
}