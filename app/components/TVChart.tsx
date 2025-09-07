// app/components/TVChart.tsx
"use client";
import { useEffect, useRef } from "react";

type Props = { symbol: string; exchange?: string; height?: number };

function tvSymbol(symbol: string, exchange?: string) {
  const ex = (exchange || "").toUpperCase();
  const prefix =
    ex.includes("NASDAQ") ? "NASDAQ" :
    ex.includes("NYSE")   ? "NYSE"   :
    ex.includes("AMEX")   ? "AMEX"   : "NASDAQ";
  return `${prefix}:${symbol.toUpperCase()}`;
}

export default function TVChart({ symbol, exchange, height = 260 }: Props) {
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const container = document.getElementById(idRef.current);
    if (!container) return;
    container.innerHTML = ""; // reset

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: tvSymbol(symbol, exchange),
      width: "100%",
      height,
      locale: "en",
      dateRange: "12M",
      colorTheme: "light",
      isTransparent: false,
      autosize: true,
      largeChartUrl: "", // set to a route like /chart?symbol=AAPL if you build one
    });

    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    wrap.appendChild(inner);
    inner.appendChild(script);

    container.appendChild(wrap);
  }, [symbol, exchange, height]);

  return <div id={idRef.current} className="w-full" />;
}

