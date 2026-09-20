"use client";

import { useEffect, useState, type ReactNode } from "react";
import { POLL_MS } from "@/lib/crowd";
import { simHistory, type HistoryPoint } from "@/lib/sim";
import { fetchReadingHistory } from "@/lib/supabase";

const VB = { w: 320, h: 222, l: 40, r: 8, t: 8, b: 48 };
const Y_MIN = 0;
const Y_MAX = 100;

type Props = {
  locationId: string;
  live: boolean;
  leading?: ReactNode;
};

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function plot(rows: HistoryPoint[], y0: number, y1: number) {
  const span = y1 - y0;
  const innerW = VB.w - VB.l - VB.r;
  const innerH = VB.h - VB.t - VB.b;
  const times = rows.map((r) => Date.parse(r.created_at));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const tspan = Math.max(1, t1 - t0);
  const pts = rows.map((r, i) => ({
    x: VB.l + ((times[i] - t0) / tspan) * innerW,
    y: VB.t + (1 - (r.density - y0) / span) * innerH,
    v: r.density,
  }));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => y0 + t * span);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    x: VB.l + t * innerW,
    iso: new Date(t0 + t * tspan).toISOString(),
  }));
  return { pts, yTicks, xTicks, innerH };
}

export default function SimGraphs({ locationId, live, leading }: Props) {
  const [rows, setRows] = useState<HistoryPoint[]>(() =>
    live ? [] : simHistory(24),
  );

  useEffect(() => {
    if (!live) {
      setRows(simHistory(24));
      return;
    }

    let cancelled = false;
    const controller = { current: new AbortController() };

    const load = async () => {
      controller.current.abort();
      controller.current = new AbortController();
      const { signal } = controller.current;
      try {
        const data = await fetchReadingHistory(locationId, 240, { signal });
        if (!cancelled && !signal.aborted) setRows(data);
      } catch {
        if (signal.aborted || cancelled) return;
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      controller.current.abort();
      window.clearInterval(intervalId);
    };
  }, [locationId, live]);

  if (rows.length < 2) {
    return (
      <section className="detail-panel-inner sim-graphs" aria-label="People over time">
        {leading}
        <p className="sim-graphs-title">People over time</p>
        <p className="dev-hint">Need at least two ESP32 readings to graph.</p>
      </section>
    );
  }

  const { pts, yTicks, xTicks, innerH } = plot(rows, Y_MIN, Y_MAX);
  const baseline = VB.t + innerH;
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${pts[0].x.toFixed(1)},${baseline} ${line} ${pts[pts.length - 1].x.toFixed(1)},${baseline}`;
  const yTitleAt = VB.t + innerH / 2;
  const markAll = pts.length <= 48;
  const last = pts[pts.length - 1];

  return (
    <section className="detail-panel-inner sim-graphs" aria-label="People over time">
      {leading}
      <div className="sim-graphs-stage">
        <svg
          className="sim-graphs-chart"
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={
            live
              ? "People over time from ESP32 readings"
              : "People over time, simulated XY plot"
          }
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
          {xTicks.map((tick, i) => (
            <g key={`x-${i}`}>
              <line
                className="sim-graphs-grid"
                x1={tick.x}
                x2={tick.x}
                y1={VB.t}
                y2={baseline}
              />
              <text
                className="sim-graphs-tick"
                x={tick.x}
                y={baseline + 14}
                textAnchor="middle"
              >
                {clockLabel(tick.iso)}
              </text>
            </g>
          ))}
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
          {markAll
            ? pts.map((p, i) => (
                <circle key={i} className="sim-graphs-pt" cx={p.x} cy={p.y} r={2.4} />
              ))
            : (
                <circle className="sim-graphs-pt" cx={last.x} cy={last.y} r={2.4} />
              )}
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
