import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { createServerProject } from "@/lib/server-project-store";
import { buildDriveTree, extractFolderId, flattenDriveTree, streamUploadToCloudinary } from "@/lib/drive";
import { logInfo, logWarn, logError } from "@/lib/session-logger";
import path from "path";
import { getDataDir } from "@/lib/data-dir";
import { mkdir, writeFile, readFile } from "fs/promises";

export const runtime = "nodejs";

type UploadState = {
  projectId: string;
  files: Array<{ name: string; relativePath: string; uploaded: boolean; cloudinaryId?: string }>;
  startedAt: string;
  completed: boolean;
};

const UPLOADS_DIR = path.join(getDataDir(), "uploads");
const UPLOAD_STATE_FILE = path.join(UPLOADS_DIR, "upload-state.json");

async function saveUploadState(state: UploadState): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(UPLOAD_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function loadUploadState(projectId: string): Promise<UploadState | null> {
  try {
    const data = await readFile(UPLOAD_STATE_FILE, "utf8");
    const state = JSON.parse(data) as UploadState;
    return state.projectId === projectId ? state : null;
  } catch {
    return null;
  }
}

async function deleteUploadState(): Promise<void> {
  try { await import("fs").then(fs => fs.promises.unlink(UPLOAD_STATE_FILE)); } catch { }
}

export async function POST(request: Request) {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const driveUrl = searchParams.get("driveUrl") || (await request.json()).driveUrl;
    if (!driveUrl) {
      return NextResponse.json({ ok: false, message: "Lien Google Drive manquant." }, { status: 400 });
    }

    const folderId = extractFolderId(driveUrl);
    if (!folderId) {
      return NextResponse.json({ ok: false, message: "Lien Google Drive invalide." }, { status: 400 });
    }

    if (!isDriveConfigured()) {
      return NextResponse.json({ ok: false, message: "Google Drive non configuré. Ajoute GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET et GOOGLE_DRIVE_REFRESH_TOKEN dans Netlify." }, { status: 500 });
    }

    const drive = await buildDriveTree(folderId);
    const flattened = flattenDriveTree(drive);
    if (flattened.length === 0) {
      return NextResponse.json({ ok: false, message: "Aucune image trouvée dans ce dossier Drive." }, { status: 400 });
    }

    const projectName = drive.name || "Projet Drive";
    const cloudinaryFolder = projectName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const uploadViaCloudinary = isCloudinaryConfigured();

    const projectId = `drive-${Date.now()}-${projectName.replace(/[^a-z0-9]/gi, "-").slice(0, 20)}`;

    const existingState = await loadUploadState(projectId);
    const filesToProcess = existingState?.completed ? [] : (existingState?.files || flattened);

    const cloudinaryPhotos: any[] = [];
    const uploadedFiles: any[] = [];

    for (const item of filesToProcess) {
      if (item.uploaded) continue;

      try {
        const stream = await downloadDriveFile(item.file.id);
        const result = await streamUploadToCloudinary(
          stream,
          cloudinaryFolder,
          `${projectId}-${item.file.name.replace(/[^a-z0-9.]/gi, "-")}`
        );
        cloudinaryPhotos.push({
          originalRelativePath: item.relativePath,
          watermarkedUrl: result.watermarkedUrl,
          cloudinaryPublicId: result.publicId,
        });
        uploadedFiles.push({
          ...item.file,
          watermarkedUrl: result.watermarkedUrl,
        });
        
        item.uploaded = true;
        item.cloudinaryId = result.publicId;
        await saveUploadState({ ...existingState!, files: filesToProcess });
      } catch (error) {
        console.error(`Failed to upload ${item.file.name}:`, error);
        continue;
      }
    }

    if (uploadedFiles.length === 0 && !existingState?.completed) {
      return NextResponse.json({ ok: false, message: "Aucune image n'a pu être uploadée vers Cloudinary." }, { status: 500 });
    }

    const project = await createServerProject({
      accessCode: "0000",
      eventDate: new Date().toISOString().slice(0, 10),
      eventType: "Evenement",
      files: uploadedFiles,
      notificationEmail: "",
      notificationWhatsapp: "",
      driveUrl,
      projectName,
      quotas: {
        start: 100,
        premium: 10,
        enlargement: 3,
      },
      venue: "Drive Import",
      cloudinaryPhotos,
    });

    await deleteUploadState();

    await logInfo("drive-import", "Import Drive réussi", {
      projectId: project.id,
      projectName: project.coupleName,
      filesCount: uploadedFiles.length,
    });

    return NextResponse.json({ ok: true, project, files: uploadedFiles.length, completed: true });
  } catch (error) {
    console.error("Drive import failed:", error);
    await logError("drive-import", "Import Drive échoué", { error: String(error) });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Import Drive impossible." },
      { status: 500 }
    );
  }
}

async function downloadDriveFile(fileId: string) {
  const { downloadDriveFile } = await import("@/lib/drive");
  return downloadDriveFile(fileId);
}

export async function GET(request: Request) {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ ok: false, message: "projectId manquant." }, { status: 400 });
    }

    const state = await loadUploadState(projectId);
    if (!state) {
      return NextResponse.json({ ok: false, message: "Aucun upload en cours pour ce projet." }, { status: 404 });
    }

    const progress = Math.round((state.files.filter(f => f.uploaded).length / state.files.length) * 100);
    return NextResponse.json({ ok: true, state, progress });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 });
  }
}