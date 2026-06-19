import { NextResponse } from "next/server";
import { createServerProject } from "@/lib/server-project-store";
import { isCloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";
import { requireAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";

function debugFormKeys(formData: FormData): string {
  const keys: string[] = [];
  for (const key of formData.keys()) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys.join(", ");
}

function readString(formData: FormData, key: string, fallback = "") {
  try {
    const value = formData.get(key);
    return typeof value === "string" ? value : fallback;
  } catch {
    return fallback;
  }
}

function readNumber(formData: FormData, key: string, fallback: number) {
  const parsed = Number(readString(formData, key, String(fallback)));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "projet";
}

function getFolderName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return "Photos";
  return parts.slice(1, -1).join(" / ");
}

export async function POST(request: Request) {
  try {
    const authError = requireAdminAuth();
    if (authError) return authError;

    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const relativePaths = formData.getAll("relativePaths").map((value) => String(value));

    const accessCode = readString(formData, "accessCode");
    if (!/^\d{4}$/.test(accessCode)) {
      const keys = debugFormKeys(formData);
      console.error(`Import 400: accessCode="${accessCode}" keys=[${keys}] files=${files.length}`);
      return NextResponse.json({ ok: false, message: "Code client invalide ou manquant." }, { status: 400 });
    }

    const projectName = readString(formData, "projectName", "Projet Samy");
    const uploadViaCloudinary = isCloudinaryConfigured();

    let filesWithUrls = files.map((file, index) => ({
      file,
      relativePath: relativePaths[index] || file.name
    }));

    if (uploadViaCloudinary) {
      const cloudinaryFolder = slugify(projectName);
      const uploaded = await Promise.all(
        filesWithUrls.map(async (item) => {
          const result = await uploadToCloudinary(item.file, `${cloudinaryFolder}/${slugify(getFolderName(item.relativePath))}`);
          return {
            ...item,
            cloudinaryUrl: result.watermarkedUrl,
            cloudinaryPublicId: result.publicId
          };
        })
      );

      const photoMap = new Map<string, { publicId: string; url: string }>();
      for (const item of uploaded) {
        photoMap.set(item.relativePath, {
          publicId: item.cloudinaryPublicId,
          url: item.cloudinaryUrl
        });
      }

      const project = await createServerProject({
        accessCode,
        eventDate: readString(formData, "eventDate", new Date().toISOString().slice(0, 10)),
        eventType: readString(formData, "eventType", "Evenement"),
        files: filesWithUrls.map((item, index) => ({
          file: item.file,
          relativePath: item.relativePath
        })),
        notificationEmail: readString(formData, "notificationEmail"),
        notificationWhatsapp: readString(formData, "notificationWhatsapp"),
        driveUrl: readString(formData, "driveUrl"),
        projectName,
        quotas: {
          start: readNumber(formData, "quotaStart", 100),
          premium: readNumber(formData, "quotaPremium", 10),
          enlargement: readNumber(formData, "quotaEnlargement", 3)
        },
        venue: readString(formData, "venue", "Yaounde"),
        cloudinaryPhotos: uploaded.map((item) => ({
          originalRelativePath: item.relativePath,
          watermarkedUrl: item.cloudinaryUrl,
          cloudinaryPublicId: item.cloudinaryPublicId
        }))
      });

      return NextResponse.json({ ok: true, project, cloudinary: true });
    }

    const project = await createServerProject({
      accessCode,
      eventDate: readString(formData, "eventDate", new Date().toISOString().slice(0, 10)),
      eventType: readString(formData, "eventType", "Evenement"),
      files: filesWithUrls,
      notificationEmail: readString(formData, "notificationEmail"),
      notificationWhatsapp: readString(formData, "notificationWhatsapp"),
      driveUrl: readString(formData, "driveUrl"),
      projectName,
      quotas: {
        start: readNumber(formData, "quotaStart", 100),
        premium: readNumber(formData, "quotaPremium", 10),
        enlargement: readNumber(formData, "quotaEnlargement", 3)
      },
      venue: readString(formData, "venue", "Yaounde")
    });

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Import impossible.";
    console.error("server import failed:", msg, error);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
