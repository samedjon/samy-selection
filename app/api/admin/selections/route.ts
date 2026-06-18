import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { listAllSelections, getSelectionsByProject } from "@/lib/selections-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAdminAuth();
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (projectId) {
      const selections = await getSelectionsByProject(projectId);
      return NextResponse.json({ ok: true, selections });
    }

    const selections = await listAllSelections();
    return NextResponse.json({ ok: true, selections });
  } catch (error) {
    console.error("Failed to list selections:", error);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
