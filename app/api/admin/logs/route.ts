import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getRecentLogs, getLogsByCategory, getLogsByLevel } from "@/lib/session-logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAdminAuth();
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const level = searchParams.get("level");
    const count = Math.min(Number(searchParams.get("count")) || 100, 500);

    let logs;
    if (category) {
      logs = await getLogsByCategory(category, count);
    } else if (level) {
      logs = await getLogsByLevel(level as any, count);
    } else {
      logs = await getRecentLogs(count);
    }

    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return NextResponse.json({ ok: false, logs: [], message: "Erreur" }, { status: 500 });
  }
}
