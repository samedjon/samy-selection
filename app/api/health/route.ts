import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/session-logger";
import { listServerProjects } from "@/lib/server-project-store";
import { listAllSelections } from "@/lib/selections-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [logs, projects, selections] = await Promise.all([
      getRecentLogs(20),
      listServerProjects().catch(() => []),
      listAllSelections().catch(() => [])
    ]);

    const errors = logs.filter((l) => l.level === "error");
    const warnings = logs.filter((l) => l.level === "warn");

    return NextResponse.json({
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      stats: {
        projects: projects.length,
        selectionsConfirmed: selections.length,
        recentErrors: errors.length,
        recentWarnings: warnings.length
      },
      recentLogs: logs.reverse()
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "error",
      message: String(error)
    }, { status: 500 });
  }
}
