"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { simHistory } from "@/lib/sim";

const ROWS = simHistory(24);
const VB = { w: 320, h: 176, l: 46, r: 12, t: 10, b: 30 };

const SLIDES: {
  key: string;
  caption: string;
  yLabel: string;
  yMin: number;
  yMax: number;
  values: number[];
  format: (v: number) => string;
}[] = [
  {
    key: "people",
    caption: "People over time",
    yLabel: "Density",
    yMin: 0,
    yMax: 100,
    values: ROWS.map((r) => r.density),
    format: (v) => String(Math.round(v)),
  },
  {
    key: "packets",
    caption: "WiFi packets",
    yLabel: "Packets",
    yMin: 0,
    yMax: 7000,
    values: ROWS.map((r) => r.packet_count ?? 0),
    format: (v) => String(Math.round(v)),
  },
  {
    key: "rssi",
    caption: "Signal strength",
    yLabel: "dBm",
    yMin: -90,
    yMax: -50,
    values: ROWS.map((r) => r.avg_rssi ?? 0),
    format: (v) => v.toFixed(0),
  },
];

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function plot(values: number[], y0: number, y1: number) {
  const span = y1 - y0;
  const innerW = VB.w - VB.l - VB.r;
  const innerH = VB.h - VB.t - VB.b;
  const pts = values.map((v, i) => ({
    x: VB.l + (i / (values.length - 1)) * innerW,
    y: VB.t + (1 - (v - y0) / span) * innerH,
    v,
  }));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => y0 + t * span);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    Math.round(t * (values.length - 1)),
  );
  return { pts, yTicks, xTicks, innerH };
}

export default function SimGraphs() {
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];
  const { pts, yTicks, xTicks, innerH } = plot(
    current.values,
    current.yMin,
    current.yMax,
  );
  const baseline = VB.t + innerH;
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${pts[0].x.toFixed(1)},${baseline} ${line} ${pts[pts.length - 1].x.toFixed(1)},${baseline}`;

  function prev() {
    setSlide((s) => (s - 1 + SLIDES.length) % SLIDES.length);
  }
  function next() {
    setSlide((s) => (s + 1) % SLIDES.length);
  }

  return (
    <section className="detail-panel-inner sim-graphs" aria-label="Simulated movement">
      <div className="detail-header">
        <div>
          <p className="detail-kicker">Simulated</p>
          <h2>{current.caption}</h2>
        </div>
      </div>
      <div className="sim-graphs-stage">
        <button
          type="button"
          className="icon-btn sim-graphs-nav"
          aria-label="Previous graph"
          onClick={prev}
        >
          <ChevronLeft size={18} />
        </button>
        <svg
          className="sim-graphs-chart"
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          role="img"
          aria-label={`${current.caption}, simulated XY plot`}
        >
          {yTicks.map((tick, i) => {
            const y =
              VB.t + (1 - (tick - yTicks[0]) / (yTicks[yTicks.length - 1] - yTicks[0])) * innerH;
            return (
              <g key={`y-${i}`}>
                <line
                  className="sim-graphs-grid"
                  x1={VB.l}
                  x2={VB.w - VB.r}
                  y1={y}
                  y2={y}
                />
                <text className="sim-graphs-tick" x={VB.l - 4} y={y + 3} textAnchor="end">
                  {current.format(tick)}
                </text>
              </g>
            );
          })}
          {xTicks.map((idx) => {
            const p = pts[idx];
            return (
              <g key={`x-${idx}`}>
                <line
                  className="sim-graphs-grid"
                  x1={p.x}
                  x2={p.x}
                  y1={VB.t}
                  y2={baseline}
                />
                <text
                  className="sim-graphs-tick"
                  x={p.x}
                  y={VB.h - 8}
                  textAnchor="middle"
                >
                  {clockLabel(ROWS[idx].created_at)}
                </text>
              </g>
            );
          })}
          <line
            className="sim-graphs-axis"
            x1={VB.l}
            y1={VB.t}
            x2={VB.l}
            y2={baseline}
          />
          <line
            className="sim-graphs-axis"
            x1={VB.l}
            y1={baseline}
            x2={VB.w - VB.r}
            y2={baseline}
          />
          <polygon className="sim-graphs-area" points={area} />
          <polyline className="sim-graphs-line" points={line} />
          {pts.map((p, i) => (
            <circle key={i} className="sim-graphs-pt" cx={p.x} cy={p.y} r={2.4} />
          ))}
          <text
            className="sim-graphs-axis-label"
            x={12}
            y={VB.h / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${VB.h / 2})`}
          >
            {current.yLabel}
          </text>
          <text
            className="sim-graphs-axis-label"
            x={(VB.l + VB.w - VB.r) / 2}
            y={VB.h - 1}
            textAnchor="middle"
          >
            Time
          </text>
        </svg>
        <button
          type="button"
          className="icon-btn sim-graphs-nav"
          aria-label="Next graph"
          onClick={next}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
