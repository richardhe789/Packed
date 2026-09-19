"use client";

import { simHistory } from "@/lib/sim";

const ROWS = simHistory(24);
const VALUES = ROWS.map((r) => r.density);
const VB = { w: 320, h: 208, l: 40, r: 8, t: 8, b: 34 };
const Y_MIN = 0;
const Y_MAX = 100;

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
  const { pts, yTicks, xTicks, innerH } = plot(VALUES, Y_MIN, Y_MAX);
  const baseline = VB.t + innerH;
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${pts[0].x.toFixed(1)},${baseline} ${line} ${pts[pts.length - 1].x.toFixed(1)},${baseline}`;
  const yTitleAt = VB.t + innerH / 2;

  return (
    <section className="detail-panel-inner sim-graphs" aria-label="People over time">
      <div className="sim-graphs-stage">
        <svg
          className="sim-graphs-chart"
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          role="img"
          aria-label="People over time, simulated XY plot"
        >
          {yTicks.map((tick, i) => {
            const y =
              VB.t +
              (1 - (tick - yTicks[0]) / (yTicks[yTicks.length - 1] - yTicks[0])) *
                innerH;
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
                  {Math.round(tick)}
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
            y={yTitleAt}
            textAnchor="middle"
            transform={`rotate(-90 12 ${yTitleAt})`}
          >
            People
          </text>
          <text
            className="sim-graphs-axis-label"
            x={VB.w - VB.r}
            y={VB.h - 2}
            textAnchor="end"
          >
            Time
          </text>
        </svg>
      </div>
      <p className="sim-graphs-title">People over time</p>
    </section>
  );
}
