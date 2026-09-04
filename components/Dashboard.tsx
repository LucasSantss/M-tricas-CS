"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfigResponse, DepartmentDto, WeekDto } from "@/lib/types";
import type { ReportResult } from "@/lib/metrics";
import SettingsPanel from "./SettingsPanel";
import SettingsModal from "./SettingsModal";
import TopBar from "./TopBar";
import DepartmentCard from "./DepartmentCard";

const QUARTERS = [
  { value: 1, label: "1º trimestre (jan–mar)" },
  { value: 2, label: "2º trimestre (abr–jun)" },
  { value: 3, label: "3º trimestre (jul–set)" },
  { value: 4, label: "4º trimestre (out–dez)" },
];

function currentQuarter(month: number): 1 | 2 | 3 | 4 {
  return (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
}

export default function Dashboard() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(currentQuarter(now.getMonth()));
  const [weeks, setWeeks] = useState<WeekDto[]>([]);
  const [weekStart, setWeekStart] = useState<string>("");

  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string> | null>(null); // null = todos

  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    (async () => {
      const res = await fetch(`/api/weeks?year=${year}&quarter=${quarter}`);
      const json = await res.json();
      const list: WeekDto[] = json.weeks ?? [];
      setWeeks(list);
      if (list.length > 0 && !list.find((w) => w.mondayDate === weekStart)) {
        setWeekStart(list[list.length - 1].mondayDate);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [year, quarter]);

  const loadReport = useCallback(async () => {
    if (!weekStart || !config?.chatbotUrl || !config?.hasToken) return;
    setLoading(true);
    setError(null);
    try {
      const idsParam =
        selectedDeptIds && selectedDeptIds.size > 0 ? `&departmentIds=${Array.from(selectedDeptIds).join(",")}` : "";
      const res = await fetch(`/api/report?weekStart=${weekStart}${idsParam}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar relatório");
      setReport(json);
    } catch (e: any) {
      setError(e.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart, config, selectedDeptIds]);

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
          <div className="greeting">Time, bom dia!</div>
          <h1>Termômetro Operacional</h1>
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
          <label>Trimestre</label>
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            {QUARTERS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>Semana (seg 00h → sáb 14h)</label>
          <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
            {weeks.map((w) => (
              <option key={w.mondayDate} value={w.mondayDate}>
                {w.label} · {new Date(w.start).toLocaleDateString("pt-BR")} a {new Date(w.end).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
        </div>
        {activeDepartments.length > 0 && (
          <div className="field grow">
            <label>Setores no relatório</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {activeDepartments.map((d) => {
                const isOn = !selectedDeptIds || selectedDeptIds.has(d.departmentId);
                return (
                  <button
                    key={d.departmentId}
                    className="btn small"
                    style={{ opacity: isOn ? 1 : 0.45 }}
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
