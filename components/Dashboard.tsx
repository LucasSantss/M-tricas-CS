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
import WeeklySummary from "./WeeklySummary";
import FilterBar from "./FilterBar";

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
          <div className="page-header-row">
            <h1>Termômetro Operacional</h1>
            <button className="btn small" disabled={loading || refreshing} onClick={() => loadReport(true)}>
              {refreshing ? "Recarregando…" : "🔄 Recarregar"}
            </button>
          </div>
          {report && (
            <div className="subtitle">
              {report.previousWeek.label} → {report.currentWeek.label} · comparativo de TME, TMA, TMR, CSAT e volume por setor
            </div>
          )}
        </header>

        <FilterBar
          year={year}
          onYearChange={setYear}
          month={month}
          onMonthChange={setMonth}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          weeks={weeks}
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
          activeDepartments={activeDepartments}
          selectedAttendantIds={selectedAttendantIds}
          onAttendantFilterChange={updateAttendantFilter}
          selectedDeptIds={selectedDeptIds}
          onSelectedDeptIdsChange={setSelectedDeptIds}
        />

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

          <WeeklySummary highlights={report.summary?.highlights ?? []} attention={report.summary?.attention ?? []} />

          <footer>
            Termômetro Operacional do Suporte — comparativo {report.previousWeek.label} vs {report.currentWeek.label}
          </footer>
        </>
      )}
      </div>
    </>
  );
}
