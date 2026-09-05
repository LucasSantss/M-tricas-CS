import type { Department } from "./db";
import type { SuriAttendance } from "./suri";
import type { WeekRange } from "./weeks";

export type MetricKey = "tme" | "tma" | "tmr" | "csat";

export type MetricStat = {
  key: MetricKey;
  label: string;
  /** valor médio em segundos (tme/tma/tmr) ou nota 0-5 (csat) */
  value: number | null;
  formatted: string;
  goalLabel: string;
  goalMet: boolean | null;
};

export type DepartmentReport = {
  departmentId: string;
  name: string;
  atendimentos: { current: number; previous: number; deltaPct: number | null };
  respostas: { current: number; previous: number; deltaPct: number | null };
  metrics: {
    key: MetricKey;
    label: string;
    from: string;
    to: string;
    goalLabel: string;
    deltaPct: number | null;
    /** direção real da variação (up = aumentou, down = diminuiu, flat = igual) */
    direction: "up" | "down" | "flat";
    /** se a variação é boa (verde) ou ruim (laranja), dado o sentido da métrica */
    isImprovement: boolean | null;
    goalMet: boolean | null;
    prevGoalMet: boolean | null;
    sampleTooSmall: boolean;
  }[];
  goalsMet: number;
  goalsTotal: number;
};

export type Callout = { level: "good" | "warn" | "bad"; departmentId: string; text: string };

export type ReportResult = {
  currentWeek: { label: string; mondayDate: string; start: string; end: string };
  previousWeek: { label: string; mondayDate: string; start: string; end: string };
  departments: DepartmentReport[];
  highlights: Callout[];
  attention: Callout[];
};

const MIN_CSAT_SAMPLE = 5;
const LOWER_IS_BETTER: Record<MetricKey, boolean> = { tme: true, tma: true, tmr: true, csat: false };

function fmtHms(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

function fmtGoalTime(seconds: number): string {
  if (seconds % 3600 === 0) return `meta ≤ ${seconds / 3600}h`;
  if (seconds % 60 === 0) return `meta ≤ ${seconds / 60} min`;
  return `meta ≤ ${fmtHms(seconds)}`;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function parseCsat(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type Agg = {
  count: number;
  tmeSeconds: number[];
  tmaSeconds: number[];
  tmrSeconds: number[];
  csatValues: number[];
};

function aggregate(records: SuriAttendance[]): Agg {
  const a: Agg = { count: 0, tmeSeconds: [], tmaSeconds: [], tmrSeconds: [], csatValues: [] };
  for (const r of records) {
    a.count += 1;
    a.tmeSeconds.push((r.waitingTime ?? 0) * 60);
    a.tmaSeconds.push((r.attendanceTime ?? 0) * 60);
    a.tmrSeconds.push((r.avgResponseTime ?? 0) * 60);
    const csat = parseCsat(r.surveyGrade);
    if (csat != null) a.csatValues.push(csat);
  }
  return a;
}

/**
 * Registros de um setor. O filtro de atendente(s) (setor ou pessoal) já é
 * aplicado na própria chamada à API Suri (ver app/api/report/route.ts); aqui
 * só garantimos que cada registro pertence de fato ao setor certo.
 */
function recordsForDepartment(records: SuriAttendance[], dept: Department): SuriAttendance[] {
  return records.filter((r) => {
    const key = r.departmentId ?? r.departmentName ?? "sem-setor";
    return key === dept.departmentId;
  });
}

// "Atendimentos" conta atendimentos SOLICITADOS dentro do período
// (requestDate) — igual à coluna "Solicitados" do portal.
function filterByWindow(records: SuriAttendance[], week: WeekRange): SuriAttendance[] {
  return records.filter((r) => {
    if (!r.requestDate) return false;
    const t = new Date(r.requestDate).getTime();
    return t >= week.start.getTime() && t < week.end.getTime();
  });
}

/**
 * A API da Suri pode retornar mais de uma linha para o mesmo atendimento
 * (mesmo protocolo, timestamps quase idênticos) — provavelmente reenvio/
 * reprocessamento interno. Deduplicamos por protocolo para bater com o
 * número de "Finalizados" do próprio portal.
 */
function dedupeByProtocol(records: SuriAttendance[]): SuriAttendance[] {
  const byProtocol = new Map<string, SuriAttendance>();
  for (const r of records) {
    if (!r.protocol) continue;
    const existing = byProtocol.get(r.protocol);
    if (!existing || new Date(r.endDate).getTime() >= new Date(existing.endDate).getTime()) {
      byProtocol.set(r.protocol, r);
    }
  }
  return Array.from(byProtocol.values());
}

/** Exclui atendimentos internos de teste (motivo contendo "teste"). */
function isTestAttendance(r: SuriAttendance): boolean {
  return /teste/i.test(r.reason ?? "");
}

function deltaPct(from: number, to: number): number | null {
  if (from === 0) return to === 0 ? 0 : null;
  return ((to - from) / from) * 100;
}

export function buildReport(
  departments: Department[],
  currentRecordsRaw: SuriAttendance[],
  previousRecordsRaw: SuriAttendance[],
  currentWeek: WeekRange,
  previousWeek: WeekRange
): ReportResult {
  const currentRecords = dedupeByProtocol(filterByWindow(currentRecordsRaw, currentWeek)).filter((r) => !isTestAttendance(r));
  const previousRecords = dedupeByProtocol(filterByWindow(previousRecordsRaw, previousWeek)).filter((r) => !isTestAttendance(r));

  const highlights: ReportResult["highlights"] = [];
  const attention: ReportResult["attention"] = [];

  const deptReports: DepartmentReport[] = departments.map((dept) => {
    const cur = aggregate(recordsForDepartment(currentRecords, dept));
    const prev = aggregate(recordsForDepartment(previousRecords, dept));

    const metricDefs: { key: MetricKey; label: string; goalSeconds?: number; goalCsat?: number }[] = [
      { key: "tme", label: "TME", goalSeconds: dept.goalTmeSeconds },
      { key: "tma", label: "TMA", goalSeconds: dept.goalTmaSeconds },
      { key: "tmr", label: "TMR", goalSeconds: dept.goalTmrSeconds },
      { key: "csat", label: "CSAT", goalCsat: dept.goalCsat },
    ];

    let goalsMet = 0;
    let goalsTotal = 0;

    const metrics = metricDefs.map((def) => {
      const curSeries = def.key === "tme" ? cur.tmeSeconds : def.key === "tma" ? cur.tmaSeconds : def.key === "tmr" ? cur.tmrSeconds : cur.csatValues;
      const prevSeries = def.key === "tme" ? prev.tmeSeconds : def.key === "tma" ? prev.tmaSeconds : def.key === "tmr" ? prev.tmrSeconds : prev.csatValues;

      const curAvg = avg(curSeries);
      const prevAvg = avg(prevSeries);

      const isCsat = def.key === "csat";
      const from = prevAvg == null ? "—" : isCsat ? prevAvg.toFixed(2).replace(".", ",") : fmtHms(prevAvg);
      const to = curAvg == null ? "—" : isCsat ? curAvg.toFixed(2).replace(".", ",") : fmtHms(curAvg);
      const goalLabel = isCsat ? `meta ≥ ${def.goalCsat!.toFixed(1).replace(".", ",")}` : fmtGoalTime(def.goalSeconds!);

      const pct = prevAvg != null && curAvg != null ? deltaPct(prevAvg, curAvg) : null;
      const direction: "up" | "down" | "flat" = pct == null ? "flat" : pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
      const isImprovement =
        pct == null
          ? null
          : LOWER_IS_BETTER[def.key]
          ? pct < 0
          : pct > 0;

      const goalMet = curAvg == null ? null : isCsat ? curAvg >= def.goalCsat! : curAvg <= def.goalSeconds!;
      const prevGoalMet = prevAvg == null ? null : isCsat ? prevAvg >= def.goalCsat! : prevAvg <= def.goalSeconds!;

      if (goalMet != null) {
        goalsTotal += 1;
        if (goalMet) goalsMet += 1;
      }

      const sampleTooSmall = isCsat && cur.csatValues.length < MIN_CSAT_SAMPLE;

      return { key: def.key, label: def.label, from, to, goalLabel, deltaPct: pct, direction, isImprovement, goalMet, prevGoalMet, sampleTooSmall };
    });

    // destaques e pontos de atenção, gerados a partir dos números reais
    for (const m of metrics) {
      if (m.deltaPct == null) continue;
      const abs = Math.abs(m.deltaPct);
      const pctStr = abs.toFixed(1).replace(".", ",");
      // verbo que descreve a direção real do número (independe de ser bom ou ruim)
      const verb = m.key === "csat" ? (m.deltaPct > 0 ? "subiu" : "caiu") : m.deltaPct > 0 ? "aumentou" : "diminuiu";

      if (m.goalMet === true) {
        if (m.prevGoalMet === false) {
          highlights.push({
            level: "good",
            departmentId: dept.departmentId,
            text: `${m.label} voltou a atingir a meta (${m.goalLabel}) após a semana anterior fora do padrão, agora em ${m.to}.`,
          });
        } else if (m.isImprovement && abs >= 10) {
          highlights.push({
            level: "good",
            departmentId: dept.departmentId,
            text: `${m.label} melhorou ${pctStr}% (${m.from} → ${m.to}) e segue dentro da meta (${m.goalLabel}).`,
          });
        } else if (!m.isImprovement && abs >= 15) {
          // dentro da meta, mas a tendência é ruim — vale acompanhar antes que estoure a meta
          attention.push({
            level: "warn",
            departmentId: dept.departmentId,
            text: `${m.label} ${verb} ${pctStr}% (${m.from} → ${m.to}) mas ainda permanece dentro da meta (${m.goalLabel}) ⚠️`,
          });
        }
      } else if (m.goalMet === false) {
        if (m.prevGoalMet === true) {
          // acabou de estourar a meta nesta semana — merece destaque diferente de "segue fora"
          attention.push({
            level: "bad",
            departmentId: dept.departmentId,
            text: `${m.label} saiu da meta (${m.goalLabel}) nesta semana: ${verb} ${pctStr}% e foi para ${m.to}.`,
          });
        } else if (!m.isImprovement && abs >= 20) {
          attention.push({
            level: "bad",
            departmentId: dept.departmentId,
            text: `${m.label} piorou ${pctStr}% (${m.from} → ${m.to}), seguindo fora da meta (${m.goalLabel}).`,
          });
        } else if (m.isImprovement && abs >= 10) {
          // ainda fora da meta, mas caminhando na direção certa
          attention.push({
            level: "warn",
            departmentId: dept.departmentId,
            text: `${m.label} ${verb} ${pctStr}% e melhorou (${m.from} → ${m.to}), mas ainda está fora da meta (${m.goalLabel}).`,
          });
        } else {
          attention.push({
            level: "warn",
            departmentId: dept.departmentId,
            text: `${m.label} segue fora da meta (${m.goalLabel}), atual ${m.to}.`,
          });
        }
      }

      if (m.sampleTooSmall) {
        attention.push({
          level: "warn",
          departmentId: dept.departmentId,
          text: `CSAT calculado com poucas respostas (${cur.csatValues.length}) — leitura sensível à amostra pequena.`,
        });
      }
    }

    return {
      departmentId: dept.departmentId,
      name: dept.name,
      atendimentos: { current: cur.count, previous: prev.count, deltaPct: deltaPct(prev.count, cur.count) },
      respostas: {
        current: cur.csatValues.length,
        previous: prev.csatValues.length,
        deltaPct: deltaPct(prev.csatValues.length, cur.csatValues.length),
      },
      metrics,
      goalsMet,
      goalsTotal,
    };
  });

  return {
    currentWeek: {
      label: currentWeek.label,
      mondayDate: currentWeek.mondayDate,
      start: currentWeek.start.toISOString(),
      end: currentWeek.end.toISOString(),
    },
    previousWeek: {
      label: previousWeek.label,
      mondayDate: previousWeek.mondayDate,
      start: previousWeek.start.toISOString(),
      end: previousWeek.end.toISOString(),
    },
    departments: deptReports,
    highlights,
    attention,
  };
}
