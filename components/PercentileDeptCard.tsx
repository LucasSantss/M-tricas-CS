"use client";

type Stats = { p50: number | null; p75: number | null; p90: number | null; count: number };

function fmt(seconds: number | null): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}

const SERIES: { key: "p50" | "p75" | "p90"; tag: string; color: string }[] = [
  { key: "p50", tag: "P50", color: "var(--accent)" },
  { key: "p75", tag: "P75", color: "var(--warn)" },
  { key: "p90", tag: "P90", color: "var(--bad)" },
];

function MetricBars({ label, stats }: { label: string; stats: Stats }) {
  const max = Math.max(1, stats.p90 ?? stats.p75 ?? stats.p50 ?? 1);
  return (
    <div className="pct-metric-row">
      <div className="pct-metric-label">{label}</div>
      <div className="pct-metric-bars">
        {SERIES.map((s) => {
          const value = stats[s.key];
          const width = value == null ? 0 : Math.max(2, (value / max) * 100);
          return (
            <div className="pct-bar-line" key={s.key}>
              <span className="pct-bar-tag" style={{ color: s.color }}>
                {s.tag}
              </span>
              <div className="pct-bar-track">
                <div className="pct-bar-fill" style={{ width: `${width}%`, background: s.color }} />
              </div>
              <span className="pct-bar-value">{fmt(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  name: string;
  tme: Stats;
  tma: Stats;
  tmr: Stats;
};

export default function PercentileDeptCard({ name, tme, tma, tmr }: Props) {
  return (
    <div className="pct-dept-card">
      <div className="pct-dept-head">
        <h2>{name}</h2>
        <span className="pct-dept-count">{tme.count} atendimento{tme.count === 1 ? "" : "s"}</span>
      </div>
      <div className="pct-dept-body">
        <MetricBars label="TME — tempo médio de espera" stats={tme} />
        <MetricBars label="TMA — tempo médio de atendimento" stats={tma} />
        <MetricBars label="TMR — tempo médio de resposta" stats={tmr} />
      </div>
    </div>
  );
}
