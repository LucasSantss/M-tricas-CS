import { NextRequest, NextResponse } from "next/server";
import { deleteDepartment, listDepartments, upsertDepartment } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const departments = await listDepartments();
    return NextResponse.json({ departments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.departmentId || !body.name) {
      return NextResponse.json({ error: "departmentId e name são obrigatórios" }, { status: 400 });
    }
    const dept = await upsertDepartment({
      departmentId: String(body.departmentId),
      name: String(body.name),
      active: typeof body.active === "boolean" ? body.active : undefined,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      goalTmeSeconds: typeof body.goalTmeSeconds === "number" ? body.goalTmeSeconds : undefined,
      goalTmaSeconds: typeof body.goalTmaSeconds === "number" ? body.goalTmaSeconds : undefined,
      goalTmrSeconds: typeof body.goalTmrSeconds === "number" ? body.goalTmrSeconds : undefined,
      goalCsat: typeof body.goalCsat === "number" ? body.goalCsat : undefined,
      attendantIds: Array.isArray(body.attendantIds) ? body.attendantIds.map(String) : undefined,
    });
    return NextResponse.json({ department: dept });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
    await deleteDepartment(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
