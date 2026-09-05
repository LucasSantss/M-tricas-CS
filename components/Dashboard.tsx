"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfigResponse, DepartmentDto, WeekDto } from "@/lib/types";
import type { ReportResult } from "@/lib/metrics";
import { isFresh, readReportCache, writeReportCache } from "@/lib/reportCache";
import { readAttendantFilter, writeAttendantFilter } from "@/lib/attendantFilter";
import { readDashboardPrefs, writeDashboardPrefs } from "@/lib/dashboardPrefs";
import SettingsPanel from "./SettingsPanel";
import SettingsModal from "./SettingsModal";
import TopBar from "./TopBar";
import DepartmentCard from "./DepartmentCard";
import AttendantFilter from "./AttendantFilter";

const MONTHS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

/** "YYYY-MM-DD" -> "DD/MM/YYYY", sem passar por Date/fuso do navegador. */
function formatBr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export default function Dashboard() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weeks, setWeeks] = useState<WeekDto[]>([]);
  const [weekStart, setWeekStart] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string> | null>(null); // null = todos
  // filtro pessoal de atendentes — só existe no navegador (localStorage), nunca no banco
  const [selectedAttendantIds, setSelectedAttendantIds] = useState<string[]>([]);
  useEffect(() => setSelectedAttendantIds(readAttendantFilter()), []);
  const updateAttendantFilter = useCallback((ids: string[]) => {
    setSelectedAttendantIds(ids);
    writeAttendantFilter(ids);
  }, []);

  // restaura ano/mês/semana/setores da última visita (cache do navegador, por pessoa)
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    const prefs = readDashboardPrefs();
    if (prefs.year) setYear(prefs.year);
    if (prefs.month) setMonth(prefs.month);
    if (prefs.weekStart) setWeekStart(prefs.weekStart);
    if (prefs.viewMode) setViewMode(prefs.viewMode);
    if (prefs.deptIds !== undefined) setSelectedDeptIds(prefs.deptIds ? new Set(prefs.deptIds) : null);
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    writeDashboardPrefs({
      year,
      month,
      weekStart,
      viewMode,
      deptIds: selectedDeptIds ? Array.from(selectedDeptIds) : null,
    });
  }, [prefsLoaded, year, month, weekStart, viewMode, selectedDeptIds]);

  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportSavedAt, setReportSavedAt] = useState<number | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/config");
    setConfig(await res.json());
  }, []);

  const loadDepartments = useCallback(async () => {
    const res = await fetch("/api/departments");
    const json = await res.json();
    setDepartments(json.departments ?? []);
  }, []);

  useEffect(() => {
    loadConfig();
    loadDepartments();
  }, [loadConfig, loadDepartments]);

  const [checkedInitialConfig, setCheckedInitialConfig] = useState(false);
  useEffect(() => {
    if (!config || checkedInitialConfig) return;
    setCheckedInitialConfig(true);
    if (!config.chatbotUrl || !config.hasToken) setSettingsOpen(true);
  }, [config, checkedInitialConfig]);

  useEffect(() => {
    if (!prefsLoaded || viewMode !== "week") return; // espera restaurar ano/mês/semana do cache antes de buscar, pra não sobrescrever com o mês atual
    (async () => {
      const res = await fetch(`/api/weeks?year=${year}&month=${month}`);
      const json = await res.json();
      const list: WeekDto[] = json.weeks ?? [];
      setWeeks(list);
      if (list.length > 0 && !list.find((w) => w.mondayDate === weekStart)) {
        setWeekStart(list[list.length - 1].mondayDate);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [year, month, prefsLoaded, viewMode]);

  const loadReport = useCallback(
    async (force = false) => {
      if (viewMode === "week" && !weekStart) return;
      if (!config?.chatbotUrl || !config?.hasToken) return;
      const deptIdsArr = selectedDeptIds ? Array.from(selectedDeptIds) : null;
      const attendantIdsArr = selectedAttendantIds.length > 0 ? selectedAttendantIds : null;
      const periodKey = viewMode === "month" ? `month:${year}-${String(month).padStart(2, "0")}` : weekStart;
      const periodParam = viewMode === "month" ? `mode=month&year=${year}&month=${month}` : `weekStart=${weekStart}`;
      setError(null);

      const cached = force ? null : readReportCache(periodKey, deptIdsArr, attendantIdsArr);
      if (cached) {
        setReport(cached.report);
        setReportSavedAt(cached.savedAt);
        if (isFresh(cached.savedAt)) return; // cache ainda fresco, não busca de novo
      }

      if (cached) setRefreshing(true);
      else setLoading(true);
      try {
        const idsParam = deptIdsArr && deptIdsArr.length > 0 ? `&departmentIds=${deptIdsArr.join(",")}` : "";
        const attendantsParam = attendantIdsArr ? `&attendantIds=${attendantIdsArr.join(",")}` : "";
        const res = await fetch(`/api/report?${periodParam}${idsParam}${attendantsParam}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Falha ao carregar relatório");
        setReport(json);
        writeReportCache(periodKey, deptIdsArr, attendantIdsArr, json);
        setReportSavedAt(Date.now());
      } catch (e: any) {
        setError(e.message);
        if (!cached) setReport(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [viewMode, year, month, weekStart, config, selectedDeptIds, selectedAttendantIds]
  );

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const activeDepartments = departments.filter((d) => d.active);
  const configured = Boolean(config?.chatbotUrl && config?.hasToken);

  return (
    <>
      <TopBar
        breadcrumb="Relatórios / Suporte"
        title="Termômetro Operacional"
        configured={configured}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <SettingsPanel config={config} departments={departments} onConfigSaved={loadConfig} onDepartmentsChanged={loadDepartments} />
      </SettingsModal>

      <div className="wrap">
        <header>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h1>Termômetro Operacional</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              
              <button className="btn small" disabled={loading || refreshing} onClick={() => loadReport(true)}>
                {refreshing ? "Recarregando…" : "🔄 Recarregar"}
              </button>
            </div>
          </div>
          {report && (
            <div className="subtitle">
              {report.previousWeek.label} → {report.currentWeek.label} · comparativo de TME, TMA, TMR, CSAT e volume por setor
            </div>
          )}
        </header>

        <div className="settings-row" style={{ marginBottom: 24 }}>
        <div className="field">
          <label>Ano</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        <div className="field">
          <label>Mês</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Período</label>
          <div className="view-mode-toggle">
            <button type="button" className={viewMode === "week" ? "on" : ""} onClick={() => setViewMode("week")}>
              Semana
            </button>
            <button type="button" className={viewMode === "month" ? "on" : ""} onClick={() => setViewMode("month")}>
              Mês inteiro
            </button>
          </div>
        </div>
        {viewMode === "week" && (
          <div className="field grow">
            <label>Semana (seg–sáb)</label>
            <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
              {weeks.map((w) => (
                <option key={w.mondayDate} value={w.mondayDate}>
                  {w.label} · {formatBr(w.mondayDate)} a {formatBr(w.saturdayDate)}
                </option>
              ))}
            </select>
          </div>
        )}
        {activeDepartments.length > 0 && (
          <div className="field">
            <label>Atendente</label>
            <AttendantFilter departments={activeDepartments} selected={selectedAttendantIds} onChange={updateAttendantFilter} />
          </div>
        )}
        {activeDepartments.length > 0 && (
          <div className="field grow">
            <label>Setores no relatório</label>
            <div className="dept-toggle-list">
              {activeDepartments.map((d) => {
                const isOn = !selectedDeptIds || selectedDeptIds.has(d.departmentId);
                return (
                  <button
                    key={d.departmentId}
                    type="button"
                    className={`dept-toggle ${isOn ? "on" : "off"}`}
                    aria-pressed={isOn}
                    onClick={() =>
                      setSelectedDeptIds((prev) => {
                        const all = new Set(activeDepartments.map((x) => x.departmentId));
                        const cur = prev ?? all;
                        const next = new Set(cur);
                        if (next.has(d.departmentId)) next.delete(d.departmentId);
                        else next.add(d.departmentId);
                        return next.size === all.size ? null : next;
                      })
                    }
                  >
                    <span className="dept-toggle-check" />
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

        {!configured && (
          <div className="error-box">
            Configure a URL do chatbot e o token clicando no ícone de ajustes (⚙️) no topo da página para começar.
          </div>
        )}
      {error && <div className="error-box">{error}</div>}
      {loading && <div className="loading">Carregando relatório…</div>}

      {report && !loading && (
        <>
          {report.departments.map((d) => (
            <DepartmentCard
              key={d.departmentId}
              report={d}
              highlights={report.highlights.filter((h) => h.departmentId === d.departmentId)}
              attention={report.attention.filter((a) => a.departmentId === d.departmentId)}
            />
          ))}

          <footer>
            Termômetro Operacional do Suporte — comparativo {report.previousWeek.label} vs {report.currentWeek.label}
          </footer>
        </>
      )}
      </div>
    </>
  );
}
