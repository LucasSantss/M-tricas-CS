// Filtro pessoal de atendentes: só existe no navegador de quem escolheu (localStorage).
// Nunca é enviado para o banco — cada pessoa pode restringir o relatório aos seus
// próprios atendentes sem interferir no que os outros veem.

const KEY = "termo:attendantFilter";

/** Lê os attendantId selecionados. null/vazio = considera todos. */
export function readAttendantFilter(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeAttendantFilter(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // localStorage cheio, desabilitado ou navegação privada — ignora silenciosamente
  }
}
