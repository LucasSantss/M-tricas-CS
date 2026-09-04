import { NextRequest, NextResponse } from "next/server";
import { getWeeksForMonth } from "@/lib/weeks";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "year e month (1-12) são obrigatórios" }, { status: 400 });
  }
  const weeks = getWeeksForMonth(year, month).map((w) => ({
    mondayDate: w.mondayDate,
    saturdayDate: w.saturdayDate,
    label: w.label,
    start: w.start.toISOString(),
    end: w.end.toISOString(),
  }));
  return NextResponse.json({ weeks });
}
