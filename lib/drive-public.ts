import "server-only";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";

/**
 * Google Drive API avec clé API publique
 * Fonctionne avec les dossiers partagés en LECTURE PUBLIQUE
 * Pas besoin de OAuth, Client ID, ou Refresh Token
 */

export function isDrivePublicConfigured(): boolean {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";
  return apiKey !== "" && !apiKey.includes("votre-cle");
}

export function extractFolderId(urlOrId: string): string | null {
  if (/^[a-zA-Z0-9_-]{25,}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
                urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                urlOrId.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function describeGoogleDriveError(status: number, rawError: string): string {
  let reason = "";
  let message = rawError;

  try {
    const parsed = JSON.parse(rawError);
    reason = parsed?.error?.details?.find((item: any) => item?.reason)?.reason || parsed?.error?.errors?.[0]?.reason || "";
    message = parsed?.error?.message || rawError;
  } catch {
    // Keep the raw body.
  }

  if (reason === "SERVICE_DISABLED" || reason === "accessNotConfigured") {
    return "Google Drive API est désactivée pour le projet Google Cloud lié à cette clé. Active drive.googleapis.com dans le projet Google Cloud, attends quelques minutes, puis relance l'import.";
  }

  if (reason === "API_KEY_SERVICE_BLOCKED") {
    return "La clé API Google bloque Google Drive API. Dans Google Cloud Console, ajoute Google Drive API dans les restrictions d'API, ou mets temporairement les restrictions d'application sur None pour tester l'appel serveur Netlify.";
  }

  if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
    return "La clé API Google est bloquée par une restriction HTTP referrer. L'import est lancé côté serveur Netlify, donc teste temporairement avec restriction d'application None, ou passe à OAuth.";
  }

  return `Google Drive API error: ${status} - ${message}`;
}

/**
 * Liste les fichiers dans un dossier Drive PUBLIC
 * Utilise une clé API au lieu de OAuth
 */
async function listFilesInFolder(folderId: string, pageToken?: string): Promise<{ files: any[]; nextPageToken?: string }> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.append("key", apiKey);
  url.searchParams.append("q", `'${folderId}' in parents and trashed = false`);
  url.searchParams.append("fields", "nextPageToken, files(id, name, mimeType, size, webViewLink, thumbnailLink)");
  url.searchParams.append("pageSize", "1000");
  if (pageToken) url.searchParams.append("pageToken", pageToken);

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(describeGoogleDriveError(response.status, error));
  }

  const data = await response.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

async function listAllFilesInFolder(folderId: string): Promise<any[]> {
  const allFiles: any[] = [];
  let pageToken: string | undefined;
  
  do {
    const result = await listFilesInFolder(folderId, pageToken);
    allFiles.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken);
  
  return allFiles;
}

async function getFolderMetadata(folderId: string): Promise<any> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?key=${apiKey}&fields=id,name,mimeType`;
  const response = await fetch(url);
  
  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(describeGoogleDriveError(response.status, error));
  }
  return await response.json();
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
}

export interface DriveFolder extends DriveFile {
  children: (DriveFile | DriveFolder)[];
}

export async function buildDriveTree(folderId: string): Promise<DriveFolder> {
  const folderMeta = await getFolderMetadata(folderId);
  
  const root: DriveFolder = { ...folderMeta, children: [] } as DriveFolder;

  async function populate(node: DriveFolder) {
    const items = await listAllFilesInFolder(node.id);
    
    for (const item of items) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        const subFolder: DriveFolder = { ...item, children: [] };
        await populate(subFolder);
        node.children.push(subFolder);
      } else if (item.mimeType.startsWith("image/")) {
        node.children.push(item);
      }
    }
    
    node.children.sort((a, b) => {
      const aIsFolder = a.mimeType === "application/vnd.google-apps.folder";
      const bIsFolder = b.mimeType === "application/vnd.google-apps.folder";
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  await populate(root);
  return root;
}

export function flattenDriveTree(folder: DriveFolder, parentPath = ""): Array<{ file: DriveFile; relativePath: string; folderPath: string }> {
  const results: Array<{ file: DriveFile; relativePath: string; folderPath: string }> = [];
  const currentPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

  for (const child of folder.children) {
    if (child.mimeType === "application/vnd.google-apps.folder") {
      results.push(...flattenDriveTree(child as DriveFolder, currentPath));
    } else {
      results.push({
        file: child,
        relativePath: `${currentPath}/${child.name}`,
        folderPath: currentPath,
      });
    }
  }
  return results;
}

/**
 * Télécharge un fichier depuis Google Drive (accès public)
 * Utilise une clé API
 */
export async function downloadDriveFile(fileId: string): Promise<NodeJS.ReadableStream> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&alt=media`;
  
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(describeGoogleDriveError(response.status, error));
  }

  // Convert Web ReadableStream to Node.js ReadableStream
  return Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
}

/**
 * Upload un stream vers Cloudinary avec watermark
 */
export async function streamUploadToCloudinary(
  stream: NodeJS.ReadableStream,
  folder: string,
  publicId: string
): Promise<{ publicId: string; secureUrl: string; watermarkedUrl: string }> {
  const { v2: cloudinary } = await import("cloudinary");
  const { getConfig } = await import("./cloudinary");
  cloudinary.config(getConfig());

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `samy-production/${folder}`,
        public_id: publicId,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error("Upload Cloudinary échoué"));
        const watermarkedUrl = cloudinary.url(result.public_id, {
          transformation: [
            { quality: "auto", fetch_format: "auto" },
            { overlay: process.env.CLOUDINARY_WATERMARK_PUBLIC_ID || "" },
            { flags: "relative", width: 0.5, gravity: "center", opacity: 40 },
          ],
        });
        resolve({ publicId: result.public_id, secureUrl: result.secure_url, watermarkedUrl });
      }
    );
    stream.pipe(uploadStream);
  });
}
