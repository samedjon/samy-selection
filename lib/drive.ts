import "server-only";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";

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

export function isDriveConfigured(): boolean {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || "";
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "";
  return clientId !== "" && clientSecret !== "" && refreshToken !== "";
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || "";
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "";

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("refresh_token", refreshToken);
  params.append("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const description = data.error_description || data.error || "erreur inconnue";
    throw new Error(`OAuth Google Drive invalide: ${description}`);
  }
  return data.access_token;
}

export function extractFolderId(urlOrId: string): string | null {
  if (/^[a-zA-Z0-9_-]{25,}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
                urlOrId.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                urlOrId.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function listFilesInFolder(folderId: string, accessToken: string, pageToken?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.append("q", `'${folderId}' in parents and trashed = false`);
  url.searchParams.append("fields", "nextPageToken, files(id, name, mimeType, size, webViewLink, thumbnailLink)");
  url.searchParams.append("pageSize", "1000");
  if (pageToken) url.searchParams.append("pageToken", pageToken);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(`Google Drive API error: ${response.status}${error ? ` - ${error}` : ""}`);
  }

  const data = await response.json();
  return {
    files: (data.files || []) as DriveFile[],
    nextPageToken: data.nextPageToken,
  };
}

async function listAllFilesInFolder(folderId: string, accessToken: string): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;
  
  do {
    const result = await listFilesInFolder(folderId, accessToken, pageToken);
    allFiles.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken);
  
  return allFiles;
}

async function getFolderMetadata(folderId: string, accessToken: string): Promise<DriveFile> {
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id, name, mimeType`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(`Failed to get folder metadata: ${response.status}${error ? ` - ${error}` : ""}`);
  }
  return await response.json();
}

export async function buildDriveTree(folderId: string): Promise<DriveFolder> {
  const accessToken = await getAccessToken();
  const folderMeta = await getFolderMetadata(folderId, accessToken);
  
  const root: DriveFolder = { ...folderMeta, children: [] } as DriveFolder;

  async function populate(node: DriveFolder) {
    const items = await listAllFilesInFolder(node.id, accessToken);
    
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

export async function downloadDriveFile(fileId: string): Promise<Readable> {
  const accessToken = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(`Failed to download file: ${response.status}${error ? ` - ${error}` : ""}`);
  }

  return Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
}

export async function streamUploadToCloudinary(
  stream: Readable,
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
