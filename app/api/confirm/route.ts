import { NextResponse } from "next/server";
import { z } from "zod";
import { findProject } from "@/lib/demo-data";
import { findServerProject, listServerProjects } from "@/lib/server-project-store";
import { buildStudioMessage } from "@/lib/whatsapp";
import { calculateExtraPrice } from "@/lib/demo-data";
import { saveSelection } from "@/lib/selections-store";
import { sendEmail } from "@/lib/send-email";
import { getCurrentUser } from "@/lib/admin-auth";
import { logInfo, logWarn, logError } from "@/lib/session-logger";

const schema = z.object({
  projectId: z.string().min(1),
  selections: z.object({
    start: z.array(z.string()),
    premium: z.array(z.string()),
    enlargement: z.array(z.string())
  })
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Selection invalide" }, { status: 400 });
    }

    const project = findProject(parsed.data.projectId) ?? (await findServerProject(parsed.data.projectId));
    if (!project) {
      await logWarn("confirm", "Projet introuvable", { projectId: parsed.data.projectId });
      return NextResponse.json({ ok: false, message: "Projet introuvable" }, { status: 404 });
    }

    const message = buildStudioMessage(project, parsed.data.selections);
    const extraCount = Math.max(0, parsed.data.selections.start.length - project.quotas.start);
    const extraPrice = calculateExtraPrice(extraCount, project);

    // Save the selection permanently
    await saveSelection({
      projectId: project.id,
      coupleName: project.coupleName,
      selections: parsed.data.selections,
      message,
      extraCount,
      extraPrice,
      status: "confirmed"
    });

    await logInfo("confirm", "Selection confirmee", {
      projectId: project.id,
      coupleName: project.coupleName,
      start: parsed.data.selections.start.length,
      premium: parsed.data.selections.premium.length,
      enlargement: parsed.data.selections.enlargement.length,
      extraCount
    });

    // Try to send email notification
    const emailTargets: string[] = [];
    if (project.notificationEmail) emailTargets.push(project.notificationEmail);
    const adminUser = getCurrentUser();
    if (adminUser?.email && !emailTargets.includes(adminUser.email)) {
      emailTargets.push(adminUser.email);
    }

    for (const to of emailTargets) {
      try {
        const sent = await sendEmail({
          to,
          subject: `Selection photo recue - ${project.coupleName}`,
          text: message
        });
        if (sent) {
          await logInfo("email", "Email envoye", { to, project: project.coupleName });
        } else {
          await logWarn("email", "Email non envoye (SMTP non configure)", { to });
        }
      } catch (e) {
        await logError("email", "Erreur envoi email", { to, error: String(e) });
      }
    }

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error("selection confirmation failed", error);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
