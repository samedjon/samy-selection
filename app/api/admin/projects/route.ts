import { NextResponse } from "next/server";
import { deleteServerProject, listServerProjects, updateServerProject } from "@/lib/server-project-store";
import { requireAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";

function checkAuth(): NextResponse | null {
  return requireAdminAuth();
}

export async function GET() {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;
    const projects = await listServerProjects();
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    console.error("list projects failed", error);
    return NextResponse.json({ ok: false, message: "Lecture des projets impossible." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;

    const body = (await request.json()) as {
      projectId?: string;
      coupleName?: string;
      coverImageUrl?: string;
      eventType?: string;
      venue?: string;
      notificationEmail?: string;
      notificationWhatsapp?: string;
      driveUrl?: string;
      isArchived?: boolean;
    };
    if (!body.projectId) {
      return NextResponse.json({ ok: false, message: "Projet manquant." }, { status: 400 });
    }

    const project = await updateServerProject(body.projectId, {
      coupleName: body.coupleName,
      coverImageUrl: body.coverImageUrl,
      eventType: body.eventType,
      venue: body.venue,
      notificationEmail: body.notificationEmail,
      notificationWhatsapp: body.notificationWhatsapp,
      driveUrl: body.driveUrl,
      isArchived: body.isArchived
    });
    if (!project) {
      return NextResponse.json({ ok: false, message: "Projet introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    console.error("update project failed", error);
    return NextResponse.json({ ok: false, message: "Modification impossible." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ ok: false, message: "Projet manquant." }, { status: 400 });
    }

    const deleted = await deleteServerProject(projectId);
    if (!deleted) {
      return NextResponse.json({ ok: false, message: "Projet introuvable." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("delete project failed", error);
    return NextResponse.json({ ok: false, message: "Suppression impossible." }, { status: 500 });
  }
}
