import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { createServerProject } from "@/lib/server-project-store";
import { 
  buildDriveTree, 
  extractFolderId, 
  flattenDriveTree, 
  downloadDriveFile, 
  streamUploadToCloudinary,
  isDriveConfigured 
} from "@/lib/drive";
import { logInfo, logError } from "@/lib/session-logger";
import path from "path";
import { getDataDir } from "@/lib/data-dir";
import { mkdir, writeFile, readFile } from "fs/promises";

export const runtime = "nodejs";

interface DriveFileItem {
  id: string;
  name: string;
  relativePath: string;
  uploaded: boolean;
  cloudinaryId?: string;
}

interface UploadState {
  projectId: string;
  files: { id: string; name: string; relativePath: string; uploaded: boolean; cloudinaryId?: string }[];
  startedAt: string;
  completed: boolean;
}

const UPLOADS_DIR = path.join(getDataDir(), "uploads");
const UPLOAD_STATE_FILE = path.join(UPLOADS_DIR, "upload-state.json");

async function saveUploadState(state: { projectId: string; files: any[]; startedAt: string; completed: boolean }): Promise<void> {
  await mkdir(path.join(getDataDir(), "uploads"), { recursive: true });
  await writeFile(path.join(getDataDir(), "uploads", "upload-state.json"), JSON.stringify(state, null, 2), "utf8");
}

async function loadUploadState(projectId: string): Promise<any> {
  try {
    const data = await readFile(path.join(getDataDir(), "uploads", "upload-state.json"), "utf8");
    const state = JSON.parse(data);
    return state.projectId === projectId ? state : null;
  } catch {
    return null;
  }
}

async function deleteUploadState(): Promise<void> {
  try { await import("fs").then(fs => fs.promises.unlink(path.join(getDataDir(), "uploads", "upload-state.json"))); } catch { }
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

    const projectId = `drive-${Date.now()}-${projectName.replace(/[^a-z0-9]/gi, "-").slice(0, 20)}`;

    const existingState = await loadUploadState(projectId);
    const filesToProcess = existingState?.completed ? [] : (existingState?.files || flattened.map(f => ({ 
      id: f.file.id, 
      name: f.file.name, 
      relativePath: f.relativePath, 
      uploaded: false 
    })));

    const cloudinaryPhotos: any[] = [];

    for (const item of filesToProcess) {
      if (item.uploaded) continue;

      try {
        const stream = await downloadDriveFile(item.id);
        const result = await streamUploadToCloudinary(
          stream,
          cloudinaryFolder,
          `${projectId}-${item.name.replace(/[^a-z0-9.]/gi, "-")}`
        );
        item.uploaded = true;
        item.cloudinaryId = result.publicId;
        await saveUploadState({ projectId, files: filesToProcess, startedAt: new Date().toISOString(), completed: false });
      } catch (error) {
        console.error(`Failed to upload ${item.name}:`, error);
        continue;
      }
    }

    const uploadedCount = filesToProcess.filter((f: DriveFileItem) => f.uploaded).length;
    if (uploadedCount === 0 && filesToProcess.length > 0) {
      return NextResponse.json({ ok: false, message: "Aucune image n'a pu être uploadée vers Cloudinary." }, { status: 500 });
    }

    const uploadedFiles = filesToProcess.filter((f: DriveFileItem) => f.uploaded).map((f: DriveFileItem) => ({
      originalRelativePath: f.relativePath,
      watermarkedUrl: f.cloudinaryId ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/v1/${f.cloudinaryId}` : "",
      cloudinaryPublicId: f.cloudinaryId,
    }));

    const project = await createServerProject({
      accessCode: "0000",
      eventDate: new Date().toISOString().slice(0, 10),
      eventType: "Evenement",
      files: [],
      notificationEmail: "",
      notificationWhatsapp: "",
      driveUrl: searchParams.get("driveUrl") || "",
      projectName: drive.name || "Projet Drive",
      quotas: { start: 100, premium: 10, enlargement: 3 },
      venue: "Drive Import",
      cloudinaryPhotos: filesToProcess.filter((f: DriveFileItem) => f.uploaded).map((f: DriveFileItem) => ({
        originalRelativePath: f.relativePath,
        watermarkedUrl: f.cloudinaryId ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/v1/${f.cloudinaryId}` : "",
        cloudinaryPublicId: f.cloudinaryId,
      })),
    });

    await logInfo("drive-import", "Import Drive réussi", {
      projectId,
      projectName: drive.name || "Projet Drive",
      filesCount: filesToProcess.filter((f: DriveFileItem) => f.uploaded).length,
    });

    return NextResponse.json({ ok: true, project: { id: projectId }, files: uploadedCount, completed: true });
  } catch (error) {
    console.error("Drive import failed:", error);
    await logError("drive-import", "Import Drive échoué", { error: String(error) });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Import Drive impossible." },
      { status: 500 }
    );
  }
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

    const progress = Math.round((state.files.filter((f: any) => f.uploaded).length / state.files.length) * 100);
    return NextResponse.json({ ok: true, state, progress });
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 });
  }
}