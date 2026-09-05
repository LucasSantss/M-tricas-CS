"use client";

import type { SummaryCallout } from "@/lib/metrics";

function SummaryRow({ item }: { item: SummaryCallout }) {
  return (
    <div className={`callout ${item.level}`}>
      <div className="summary-emoji">{item.emoji}</div>
      <div className="body">{item.text}</div>
    </div>
  );
}

type Props = {
  highlights: SummaryCallout[];
  attention: SummaryCallout[];
};

export default function WeeklySummary({ highlights, attention }: Props) {
  if (highlights.length === 0 && attention.length === 0) return null;

  return (
    <div className="week-summary">
      {highlights.length > 0 && (
        <>
          <div className="section-title">Destaques da Semana</div>
          {highlights.map((h, i) => (
            <SummaryRow item={h} key={`sh${i}`} />
          ))}
        </>
      )}
      {attention.length > 0 && (
        <>
          <div className="section-title">Pontos de Atenção</div>
          {attention.map((a, i) => (
            <SummaryRow item={a} key={`sa${i}`} />
          ))}
        </>
      )}
    </div>
  );
}
