import { NextRequest, NextResponse } from "next/server";
import { getSettings, listDepartments } from "@/lib/db";
import { fetchAttendances } from "@/lib/suri";
import { previousWeek, weekRangeForMonday } from "@/lib/weeks";
import { buildReport } from "@/lib/metrics";

export const runtime = "nodejs";

function toApiDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const mondayDate = req.nextUrl.searchParams.get("weekStart");
    const departmentIdsParam = req.nextUrl.searchParams.get("departmentIds"); // opcional, csv
    if (!mondayDate) {
      return NextResponse.json({ error: "weekStart (YYYY-MM-DD, uma segunda-feira) é obrigatório" }, { status: 400 });
    }

    const settings = await getSettings();
    if (!settings.chatbotUrl || !settings.bearerToken) {
      return NextResponse.json({ error: "Configure a URL do chatbot e o token na sessão de ajustes primeiro." }, { status: 400 });
    }

    let departments = await listDepartments();
    departments = departments.filter((d) => d.active);
    if (departmentIdsParam) {
      const wanted = new Set(departmentIdsParam.split(",").filter(Boolean));
      departments = departments.filter((d) => wanted.has(d.departmentId));
    }
    if (departments.length === 0) {
      return NextResponse.json({ error: "Nenhum setor ativo configurado. Adicione setores na sessão de ajustes." }, { status: 400 });
    }

    const currentWeek = weekRangeForMonday(mondayDate);
    const prevWeek = previousWeek(mondayDate);

    // Busca por setor (filtro departmentId direto na API), uma chamada por
    // setor ativo, para as duas semanas em paralelo.
    const perDepartment = await Promise.all(
      departments.map(async (dept) => {
        const [current, previous] = await Promise.all([
          fetchAttendances(settings.chatbotUrl!, settings.bearerToken!, {
            dateFrom: currentWeek.mondayDate,
            dateTo: toApiDate(currentWeek.end),
            departmentId: dept.departmentId,
            getCurrent: settings.getCurrent,
            useBusinessHours: settings.useBusinessHours,
          }),
          fetchAttendances(settings.chatbotUrl!, settings.bearerToken!, {
            dateFrom: prevWeek.mondayDate,
            dateTo: toApiDate(prevWeek.end),
            departmentId: dept.departmentId,
            getCurrent: settings.getCurrent,
            useBusinessHours: settings.useBusinessHours,
          }),
        ]);
        return { current, previous };
      })
    );

    const currentRecords = perDepartment.flatMap((p) => p.current);
    const previousRecords = perDepartment.flatMap((p) => p.previous);

    const report = buildReport(departments, currentRecords, previousRecords, currentWeek, prevWeek);
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
