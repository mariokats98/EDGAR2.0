// app/about/page.tsx
"use client";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100">
      {/* background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-28 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600/10 to-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-6rem] h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-400/10 to-cyan-500/10 blur-3xl" />
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 backdrop-blur px-3 py-1 text-xs text-gray-700 shadow-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
          Built for clarity, speed & real research
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900">
          Research without the noise.
        </h1>
        <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
          Herevna turns complex public data—EDGAR, BLS, FRED, and market activity—into
          clean, fast dashboards. Spend time thinking, not digging.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href="/subscribe" className="rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90">
            Get Herevna Pro
          </a>
          <a href="/edgar" className="rounded-full border bg-white px-5 py-2.5 text-sm hover:bg-gray-50">
            Explore Free Tools
          </a>
        </div>
      </section>

      {/* Stats strip */}
      <section className="mx-auto max-w-6xl px-4 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { k: "Data Sources", v: "EDGAR • BLS • FRED" },
            { k: "Focus", v: "Speed & Clarity" },
            { k: "Uptime", v: "High-availability" },
            { k: "Noise", v: "None" },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500">{s.k}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Value cards */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-5 md:grid-cols-3">
          <ValueCard
  title="Everything in One Dashboard"
  copy="EDGAR filings, economic data, and market trends—brought together in a single, searchable view. Stop tab-hopping and focus on insights that matter."
  icon={<IconDashboard />}
/>

<ValueCard
  title="Visuals That Speak"
  copy="Data that feels human. Each chart, table, and metric is designed for clarity and speed—so you spot patterns instantly without distractions."
  icon={<IconChart />}
/>

<ValueCard
  title="Built for How You Work"
  copy="From screening tickers to tracking insider and congressional trades, Herevna Pro is shaped around the real workflows of researchers and investors."
  icon={<IconWorkflow />}
/>
        </div>
      </section>

      {/* How we're different */}
      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">How Herevna is different</h2>
          <div className="mt-4 grid md:grid-cols-2 gap-6 text-sm text-gray-700">
            <ul className="space-y-2">
              <li className="flex gap-2"><Check /> Clear UI that reduces cognitive load</li>
              <li className="flex gap-2"><Check /> Snappy navigation across EDGAR, BLS, FRED</li>
              <li className="flex gap-2"><Check /> Pro dashboards for deeper filtering & speed</li>
            </ul>
            <ul className="space-y-2">
              <li className="flex gap-2"><Check /> No ad-driven distractions or dark patterns</li>
              <li className="flex gap-2"><Check /> Designed for analysts, traders & learners</li>
              <li className="flex gap-2"><Check /> “Data first” — sources are always clear</li>
            </ul>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Data is aggregated from official and public sources. See our{" "}
            <a href="/disclaimer" className="text-blue-600 underline">Data Disclaimer</a>.
          </p>
        </div>
      </section>

      {/* Timeline / Story */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-xl font-semibold text-gray-900 text-center">The Herevna story</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-5">
          <StoryStep
            title="Frustration → Focus"
            copy="We started by cutting the time it takes to find key data. Less hunting, more insight."
          />
          <StoryStep
            title="Dashboards that breathe"
            copy="Interfaces were rebuilt to be calm and legible. Every chart and filter earns its place."
          />
          <StoryStep
            title="From data to decisions"
            copy="Pro adds speed, depth, and workflow features that help you reason faster."
          />
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">What users say</h2>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            {[
              ["“I get to the point faster.”", "Cuts the time I spend hunting for data."],
              ["“Calm, focused design.”", "Zero clutter. I actually enjoy researching again."],
              ["“Everything in one place.”", "Filings, macro, trades—no constant tab jumping."],
            ].map(([q, a], i) => (
              <blockquote key={i} className="rounded-xl border bg-slate-50 p-4">
                <p className="text-gray-900 text-sm">{q}</p>
                <p className="mt-1 text-gray-600 text-xs">{a}</p>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl border bg-white/80 backdrop-blur p-6 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Ready to try Herevna?</h3>
          <p className="mt-1 text-sm text-gray-600 max-w-2xl mx-auto">
            Start with free tools or unlock Pro for faster refresh and deeper dashboards.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <a href="/edgar" className="rounded-full bg-black text-white px-5 py-2.5 text-sm hover:opacity-90">
              Explore Free Tools
            </a>
            <a href="/subscribe" className="rounded-full border bg-white px-5 py-2.5 text-sm hover:bg-gray-50">
              See Pro Options
            </a>
          </div>
          <p className="mt-4 text-[11px] text-gray-500">
            Herevna is for informational & entertainment purposes only. Not financial advice.
          </p>
        </div>
      </section>
    </main>
  );
}

/* ---------- Small components ---------- */

function ValueCard({
  title,
  copy,
  icon,
}: {
  title: string;
  copy: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-gray-700">{copy}</p>
    </div>
  );
}

function StoryStep({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h4 className="text-base font-semibold text-gray-900">{title}</h4>
      <p className="mt-2 text-sm text-gray-700">{copy}</p>
    </div>
  );
}

/* ---------- Icons (inline SVG, no deps) ---------- */
function Check() {
  return (
    <svg className="mt-0.5 h-5 w-5 flex-none text-indigo-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 16.2l-3.5-3.6L4 14l5 5 11-11-1.5-1.5z" />
    </svg>
  );
}
function IconLayers() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L1 7l11 5 9-4.09V14h2V7L12 2zM1 17l11 5 11-5-2-1-9 4-9-4-2 1z" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2l1.5 5H20l-4 3 1.5 5L13 12l-4.5 3L10 10 6 7h5.5L13 2z" />
    </svg>
  );
}
function IconFlow() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 7h8a3 3 0 010 6H8a3 3 0 000 6h13v-2H8a1 1 0 110-2h3a5 5 0 000-10H3v2z" />
    </svg>
  );
}