import { NextRequest, NextResponse } from "next/server";
import { getWeeksForQuarter } from "@/lib/weeks";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get("year"));
  const quarter = Number(req.nextUrl.searchParams.get("quarter")) as 1 | 2 | 3 | 4;
  if (!year || ![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: "year e quarter (1-4) são obrigatórios" }, { status: 400 });
  }
  const weeks = getWeeksForQuarter(year, quarter).map((w) => ({
    mondayDate: w.mondayDate,
    saturdayDate: w.saturdayDate,
    label: w.label,
    start: w.start.toISOString(),
    end: w.end.toISOString(),
  }));
  return NextResponse.json({ weeks });
}
