import type { ReportResult } from "./metrics";

const PREFIX = "termo:report:";
const TTL_MS = 15 * 60 * 1000; // 15 minutos — depois disso o cache é considerado velho

type CacheEntry = { savedAt: number; report: ReportResult };

function cacheKey(weekStart: string, deptIds: string[] | null, attendantIds: string[] | null): string {
  const ids = deptIds && deptIds.length > 0 ? [...deptIds].sort().join(",") : "all";
  const attendants = attendantIds && attendantIds.length > 0 ? [...attendantIds].sort().join(",") : "all";
  return `${PREFIX}${weekStart}:${ids}:${attendants}`;
}

/** Lê o relatório salvo no navegador para essa semana/seleção de setores/atendentes, se houver. */
export function readReportCache(
  weekStart: string,
  deptIds: string[] | null,
  attendantIds: string[] | null
): { report: ReportResult; savedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(weekStart, deptIds, attendantIds));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (!entry?.report || !entry?.savedAt) return null;
    return { report: entry.report, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < TTL_MS;
}

export function writeReportCache(weekStart: string, deptIds: string[] | null, attendantIds: string[] | null, report: ReportResult) {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { savedAt: Date.now(), report };
    window.localStorage.setItem(cacheKey(weekStart, deptIds, attendantIds), JSON.stringify(entry));
  } catch {
    // localStorage cheio, desabilitado ou navegação privada — ignora silenciosamente
  }
}

/** Limpa todo o cache de relatórios salvo (usado pelo botão "Recarregar tudo", se precisar). */
export function clearReportCache() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignora
  }
}
