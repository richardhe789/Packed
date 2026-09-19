import { modelFromReadings, type HistoryPoint, type MovementModel } from "@/lib/sim";

type Props = {
  rows: HistoryPoint[];
};

function polyline(rows: HistoryPoint[], key: "density" | "packet_count"): string {
  if (rows.length < 2) return "";
  const times = rows.map((r) => Date.parse(r.created_at));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const span = Math.max(1, t1 - t0);
  const values = rows.map((r) => {
    if (key === "density") return r.density;
    return r.packet_count ?? 0;
  });
  const max = Math.max(...values, 1);
  return values
    .map((v, i) => {
      const x = ((times[i] - t0) / span) * 100;
      const y = 36 - (v / max) * 32;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function phaseLabel(model: MovementModel): string {
  if (model.phase === "arriving") return "Arriving";
  if (model.phase === "leaving") return "Leaving";
  if (model.phase === "packed") return "Packed";
  if (model.phase === "quiet") return "Quiet";
  return "Unknown";
}

export default function HistoryChart({ rows }: Props) {
  const chronological = [...rows].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const model = modelFromReadings(chronological);

  if (chronological.length < 2) {
    return (
      <div className="dev-panel embedded">
        <h3>Movement</h3>
        <p className="dev-hint">Need at least two readings to graph a pattern.</p>
      </div>
    );
  }

  const dens = polyline(chronological, "density");
  const peakClock = model.peakAt
    ? new Date(model.peakAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="dev-panel embedded">
      <h3>Movement</h3>
      <p className="dev-hint">
        Simulated movement · {model.summary} Peak {model.peakDensity ?? "—"} at{" "}
        {peakClock}.
      </p>
      <p className="dev-hint">
        Phase: <strong>{phaseLabel(model)}</strong>
      </p>
      <svg
        className="history-chart"
        viewBox="0 0 100 40"
        role="img"
        aria-label="Density over time"
      >
        <polyline fill="none" stroke="currentColor" strokeWidth="1.2" points={dens} />
      </svg>
      <p className="dev-hint">Density over the last {chronological.length} samples</p>
    </div>
  );
}
