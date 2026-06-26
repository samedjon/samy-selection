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
  isDrivePublicConfigured,
} from "@/lib/drive-public";
import { logInfo, logError } from "@/lib/session-logger";

export const runtime = "nodejs";

type DriveImportItem = {
  id: string;
  name: string;
  relativePath: string;
};

type CloudinaryPhotoInput = {
  originalRelativePath: string;
  watermarkedUrl: string;
  cloudinaryPublicId: string;
};

function cloudinaryFolderName(projectName: string): string {
  return projectName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

function publicIdForFile(prefix: string, item: DriveImportItem): string {
  return `${prefix}-${Date.now()}-${item.name.replace(/[^a-z0-9.]/gi, "-")}`;
}

/**
 * Import depuis Google Drive avec clé API publique
 * Fonctionne avec les dossiers partagés en LECTURE PUBLIQUE
 * Pas besoin de OAuth, Client ID, ou Refresh Token
 */
export async function POST(request: Request) {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || "full";
    const driveUrl = searchParams.get("driveUrl") || body.driveUrl;
    if (!driveUrl) {
      return NextResponse.json({ ok: false, message: "Lien Google Drive manquant." }, { status: 400 });
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ ok: false, message: "Cloudinary non configuré. Vérifie les variables CLOUDINARY_* dans Netlify." }, { status: 500 });
    }

    // Vérifie que la clé API est configurée
    if (!isDrivePublicConfigured()) {
      return NextResponse.json({
        ok: false,
        message: "Clé API Google Drive non configurée. Ajoute GOOGLE_DRIVE_API_KEY dans Netlify."
      }, { status: 500 });
    }

    const folderId = extractFolderId(driveUrl);
    if (!folderId) {
      return NextResponse.json({ ok: false, message: "Lien Google Drive invalide." }, { status: 400 });
    }

    if (mode === "upload-batch") {
      const items = Array.isArray(body.items) ? body.items as DriveImportItem[] : [];
      const projectName = String(body.projectName || "Projet Drive");
      const folder = cloudinaryFolderName(projectName);
      const prefix = String(body.batchPrefix || folder);
      const cloudinaryPhotos: CloudinaryPhotoInput[] = [];
      const uploadedFiles: DriveImportItem[] = [];
      const failedItems: Array<DriveImportItem & { error: string }> = [];

      for (const item of items) {
        try {
          const stream = await downloadDriveFile(item.id);
          const result = await streamUploadToCloudinary(stream, folder, publicIdForFile(prefix, item));
          uploadedFiles.push(item);
          cloudinaryPhotos.push({
            originalRelativePath: item.relativePath,
            watermarkedUrl: result.watermarkedUrl,
            cloudinaryPublicId: result.publicId,
          });
        } catch (error) {
          console.error(`Failed to upload ${item.name}:`, error);
          failedItems.push({
            ...item,
            error: error instanceof Error ? error.message : "Erreur inconnue"
          });
        }
      }

      return NextResponse.json({
        ok: uploadedFiles.length > 0 || items.length === 0,
        uploaded: uploadedFiles.length,
        failed: items.length - uploadedFiles.length,
        failedItems,
        cloudinaryPhotos
      }, { status: uploadedFiles.length > 0 || items.length === 0 ? 200 : 500 });
    }

    if (mode === "create-project") {
      const projectName = String(body.projectName || "Projet Drive");
      const cloudinaryPhotos = Array.isArray(body.cloudinaryPhotos) ? body.cloudinaryPhotos as CloudinaryPhotoInput[] : [];
      if (cloudinaryPhotos.length === 0) {
        return NextResponse.json({ ok: false, message: "Aucune photo Cloudinary à enregistrer." }, { status: 400 });
      }

      const project = await createServerProject({
        accessCode: String(body.accessCode || "0000"),
        eventDate: String(body.eventDate || new Date().toISOString().slice(0, 10)),
        eventType: String(body.eventType || "Evenement"),
        files: [],
        notificationEmail: String(body.notificationEmail || ""),
        notificationWhatsapp: String(body.notificationWhatsapp || ""),
        driveUrl,
        projectName,
        quotas: {
          start: Number(body.quotas?.start ?? 100),
          premium: Number(body.quotas?.premium ?? 10),
          enlargement: Number(body.quotas?.enlargement ?? 3)
        },
        venue: String(body.venue || "Drive Import"),
        cloudinaryPhotos,
      });

      await logInfo("drive-public-import", "Projet Drive créé depuis lots", {
        projectId: project.id,
        projectName: project.coupleName,
        filesCount: cloudinaryPhotos.length,
      });

      return NextResponse.json({
        ok: true,
        project,
        files: cloudinaryPhotos.length,
        message: `Projet créé avec ${cloudinaryPhotos.length} images`
      });
    }

    // Construire l'arbre du dossier Drive
    const drive = await buildDriveTree(folderId);
    const flattened = flattenDriveTree(drive);
    
    if (flattened.length === 0) {
      return NextResponse.json({ ok: false, message: "Aucune image trouvée dans ce dossier Drive." }, { status: 400 });
    }

    const projectName = drive.name || "Projet Drive";
    if (mode === "scan") {
      return NextResponse.json({
        ok: true,
        projectName,
        files: flattened.length,
        items: flattened.map((item) => ({
          id: item.file.id,
          name: item.file.name,
          relativePath: item.relativePath
        }))
      });
    }

    const cloudinaryFolder = cloudinaryFolderName(projectName);

    // Upload vers Cloudinary
    const cloudinaryPhotos: any[] = [];
    const uploadedFiles: any[] = [];

    for (const item of flattened) {
      try {
        const stream = await downloadDriveFile(item.file.id);
        const result = await streamUploadToCloudinary(
          stream,
          cloudinaryFolder,
          `${Date.now()}-${item.file.name.replace(/[^a-z0-9.]/gi, "-")}`
        );
        
        uploadedFiles.push({
          id: item.file.id,
          name: item.file.name,
          relativePath: item.relativePath,
          watermarkedUrl: result.watermarkedUrl,
        });
        
        cloudinaryPhotos.push({
          originalRelativePath: item.relativePath,
          watermarkedUrl: result.watermarkedUrl,
          cloudinaryPublicId: result.publicId,
        });
      } catch (error) {
        console.error(`Failed to upload ${item.file.name}:`, error);
        continue;
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ ok: false, message: "Aucune image n'a pu être uploadée vers Cloudinary." }, { status: 500 });
    }

    // Créer le projet
    const project = await createServerProject({
      accessCode: "0000",
      eventDate: new Date().toISOString().slice(0, 10),
      eventType: "Evenement",
      files: [],
      notificationEmail: "",
      notificationWhatsapp: "",
      driveUrl,
      projectName: drive.name || "Projet Drive",
      quotas: { start: 100, premium: 10, enlargement: 3 },
      venue: "Drive Import",
      cloudinaryPhotos,
    });

    await logInfo("drive-public-import", "Import Drive réussi", {
      projectId: project.id,
      projectName: project.coupleName,
      filesCount: uploadedFiles.length,
    });

    return NextResponse.json({
      ok: true,
      project,
      files: uploadedFiles.length,
      message: `Projet créé avec ${uploadedFiles.length} images`
    });
  } catch (error) {
    console.error("Drive public import failed:", error);
    await logError("drive-public-import", "Import Drive échoué", { error: String(error) });
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Import Drive impossible." },
      { status: 500 }
    );
  }
}
