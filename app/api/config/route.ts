import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      chatbotUrl: settings.chatbotUrl,
      hasToken: Boolean(settings.bearerToken),
      useBusinessHours: settings.useBusinessHours,
      getCurrent: settings.getCurrent,
      connectionLocked: settings.connectionLocked,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: { chatbotUrl?: string; bearerToken?: string; useBusinessHours?: boolean; getCurrent?: boolean } = {};
    if (typeof body.chatbotUrl === "string") input.chatbotUrl = body.chatbotUrl.trim();
    if (typeof body.bearerToken === "string" && body.bearerToken.trim() !== "") input.bearerToken = body.bearerToken.trim();
    if (typeof body.useBusinessHours === "boolean") input.useBusinessHours = body.useBusinessHours;
    if (typeof body.getCurrent === "boolean") input.getCurrent = body.getCurrent;
    await saveSettings(input);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
