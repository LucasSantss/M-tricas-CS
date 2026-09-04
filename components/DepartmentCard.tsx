"use client";

import type { Callout, DepartmentReport } from "@/lib/metrics";

function DeltaBadge({ pct, isImprovement }: { pct: number | null; isImprovement: boolean | null }) {
  if (pct == null) return <span className="delta flat">—</span>;
  const arrow = pct > 0.05 ? "↑" : pct < -0.05 ? "↓" : "→";
  const cls = isImprovement === true ? "good" : isImprovement === false ? "up" : "flat";
  return (
    <span className={`delta ${cls}`}>
      {arrow} {Math.abs(pct).toFixed(1).replace(".", ",")}%
    </span>
  );
}

type Props = {
  report: DepartmentReport;
  highlights: Callout[];
  attention: Callout[];
};

export default function DepartmentCard({ report, highlights, attention }: Props) {
  return (
    <div className="dept-row">
      <div className="dept">
        <div className="dept-head">
          <h2>{report.name}</h2>
          <div className="dept-status">
            {report.goalsMet} de {report.goalsTotal} metas atingidas
          </div>
        </div>
        <div className="metric-grid">
          {report.metrics.map((m) => (
            <div className="metric-row" key={m.key}>
              <div className="metric-label">{m.label}</div>
              <div className="metric-values">
                <span className="from">{m.from}</span>
                <span className="sep">→</span>
                <span className="to">{m.to}</span>
                <span className="goal">{m.goalLabel}</span>
                {m.key === "csat" && m.isImprovement === true && report.respostas.current > 0 && (
                  <span className="badge-star">★ maior nota</span>
                )}
              </div>
              <DeltaBadge pct={m.deltaPct} isImprovement={m.isImprovement} />
              <div className="meta-flag">
                <span className={`flag-icon ${m.goalMet == null ? "na" : m.goalMet ? "ok" : "no"}`}>
                  {m.goalMet == null ? "–" : m.goalMet ? "✓" : "✕"}
                </span>
              </div>
            </div>
          ))}
          <div className="metric-row subrow">
            <div className="metric-label">Atendimentos</div>
            <div className="metric-values">
              <span className="from">{report.atendimentos.previous}</span>
              <span className="sep">→</span>
              <span className="to">{report.atendimentos.current}</span>
            </div>
            <DeltaBadge pct={report.atendimentos.deltaPct} isImprovement={null} />
            <div className="meta-flag">
              <span className="flag-icon na">–</span>
            </div>
          </div>
          <div className="metric-row subrow">
            <div className="metric-label">Respostas</div>
            <div className="metric-values">
              <span className="from">{report.respostas.previous}</span>
              <span className="sep">→</span>
              <span className="to">{report.respostas.current}</span>
            </div>
            <DeltaBadge pct={report.respostas.deltaPct} isImprovement={null} />
            <div className="meta-flag">
              <span className="flag-icon na">–</span>
            </div>
          </div>
        </div>
        {report.respostas.current < 5 && (
          <div className="note-inline">Base de respostas CSAT baixa ({report.respostas.current} avaliações) — leitura sensível a poucas notas.</div>
        )}
      </div>

      <div className="dept-callouts">
        {highlights.length === 0 && attention.length === 0 ? (
          <div className="hint">Sem destaques ou pontos de atenção nesta semana.</div>
        ) : (
          <>
            {highlights.map((h, i) => (
              <div className={`callout ${h.level}`} key={`h${i}`}>
                <div className="dot" />
                <div className="body">{h.text}</div>
              </div>
            ))}
            {attention.map((a, i) => (
              <div className={`callout ${a.level}`} key={`a${i}`}>
                <div className="dot" />
                <div className="body">{a.text}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
