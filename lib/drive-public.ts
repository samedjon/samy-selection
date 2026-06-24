import "server-only";

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

async function fetchWithApiKey(url: string): Promise<Response> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY || "";
  return fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });
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
    throw new Error(`Google Drive API error: ${response.status} - ${error}`);
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
    throw new Error(`Failed to get folder metadata: ${response.status} - ${error}`);
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
    throw new Error(`Failed to download file: ${response.status} - ${error}`);
  }

  return response.body as NodeJS.ReadableStream;
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
