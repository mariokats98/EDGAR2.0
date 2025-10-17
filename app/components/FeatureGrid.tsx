"use client";
import * as React from "react";

type Feature = {
  key: string;
  title: string;
  href: string;
  requiresPro?: boolean;
};

export default function FeatureGrid({
  isPro, // <- pass from your auth layer
  onSubscribeClick, // <- opens pricing / checkout
}: {
  isPro: boolean;
  onSubscribeClick: () => void;
}) {
  const features: Feature[] = [
    { key: "edgar", title: "EDGAR", href: "/edgar", requiresPro: false },
    { key: "bls", title: "BLS Dashboard", href: "/bls", requiresPro: true },
    { key: "screener", title: "Stock Screener", href: "/screener", requiresPro: true },
    { key: "congress", title: "Congress Tracker", href: "/congress", requiresPro: true },
  ];

  return (
    <div style={grid}>
      {features.map((f) => {
        const locked = !!f.requiresPro && !isPro;
        return (
          <div key={f.key} style={card}>
            <a
              href={locked ? "#" : f.href}
              onClick={(e) => {
                if (locked) {
                  e.preventDefault();
                  onSubscribeClick();
                }
              }}
              style={{ ...link, ...(locked ? { cursor: "not-allowed" } : {}) }}
              onMouseEnter={(e) => {
                const tip = (e.currentTarget.nextSibling as HTMLDivElement | null);
                if (tip) tip.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                const tip = (e.currentTarget.nextSibling as HTMLDivElement | null);
                if (tip) tip.style.opacity = "0";
              }}
            >
              <span>{f.title}</span>
              {locked ? <span style={lockBadge}>Locked</span> : null}
            </a>
            {locked ? (
              <div style={tooltip}>
                Subscription required. Click to upgrade →
              </div>
            ) : (
              <div style={{ height: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* styles */
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 16,
};

const card: React.CSSProperties = {
  position: "relative",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const link: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textDecoration: "none",
  color: "#111827",
  fontWeight: 600,
  fontSize: 16,
};

const lockBadge: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(0,0,0,0.04)",
};

const tooltip: React.CSSProperties = {
  transition: "opacity 120ms ease",
  opacity: 0,
  pointerEvents: "none",
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 10,
  fontSize: 12,
  color: "#6b7280",
};