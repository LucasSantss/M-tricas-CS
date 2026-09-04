import { NextRequest, NextResponse } from "next/server";
import { getSettings, listDepartments, setKnownAttendants, type KnownAttendant } from "@/lib/db";
import { fetchAttendances } from "@/lib/suri";

export const runtime = "nodejs";

function toApiDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Varre o histórico de /api/attendances dos últimos N dias, por setor
 * (filtro departmentId direto na API), e extrai os atendentes distintos
 * (id + nome) que aparecem nos registros — vira a lista "conhecida" de
 * atendentes daquele setor, usada na tela de Ajustes para escolher quem
 * entra no filtro do relatório.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = typeof body?.days === "number" && body.days > 0 ? body.days : 60;

    const settings = await getSettings();
    if (!settings.chatbotUrl || !settings.bearerToken) {
      return NextResponse.json({ error: "Configure a URL do chatbot e o token primeiro." }, { status: 400 });
    }

    const departments = await listDepartments();
    if (departments.length === 0) {
      return NextResponse.json({ error: "Nenhum setor cadastrado ainda." }, { status: 400 });
    }

    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 86400000);

    const results = await Promise.all(
      departments.map(async (dept) => {
        const records = await fetchAttendances(settings.chatbotUrl!, settings.bearerToken!, {
          dateFrom: toApiDate(dateFrom),
          dateTo: toApiDate(dateTo),
          departmentId: dept.departmentId,
          getCurrent: settings.getCurrent,
          useBusinessHours: settings.useBusinessHours,
        });

        const byId = new Map<string, KnownAttendant>();
        for (const r of records) {
          if (r.attendantId) byId.set(r.attendantId, { id: r.attendantId, name: r.attendantName ?? r.attendantId });
        }
        const knownAttendants = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        await setKnownAttendants(dept.departmentId, knownAttendants);

        return { departmentId: dept.departmentId, name: dept.name, attendantCount: knownAttendants.length };
      })
    );

    return NextResponse.json({ days, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
