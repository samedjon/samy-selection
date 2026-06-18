"use client";

import type { Folder, Photo, PriceTier, Project, SelectionType } from "@/types/selection";

const DB_NAME = "samy-selection-local";
const DB_VERSION = 1;
const STORE_NAME = "projects";

type StoredPhoto = Omit<Photo, "watermarkedUrl"> & {
  blob: Blob;
};

type StoredProject = Omit<Project, "coverImageUrl" | "photos"> & {
  coverPhotoId: string;
  photos: StoredPhoto[];
};

export type ImportProjectInput = {
  accessCode: string;
  eventDate: string;
  eventType: string;
  files: File[];
  notificationEmail: string;
  notificationWhatsapp: string;
  projectName: string;
  quotas: Record<SelectionType, number>;
  venue: string;
};

const defaultPriceGrid: PriceTier[] = [
  { min: 1, max: 50, unitPrice: 1000 },
  { min: 51, max: 200, unitPrice: 700 },
  { min: 201, max: 500, unitPrice: 500 },
  { min: 501, max: 1000, unitPrice: 300 },
  { min: 1001, max: null, unitPrice: 100 }
];

function openProjectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getRelativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name);
}

function getFolderName(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length <= 2) return "Photos";
  return parts.slice(1, -1).join(" / ");
}

function hydrateStoredProject(stored: StoredProject): Project {
  const objectUrls = new Map<string, string>();
  const photos = stored.photos.map((photo) => {
    const watermarkedUrl = URL.createObjectURL(photo.blob);
    objectUrls.set(photo.id, watermarkedUrl);
    return {
      id: photo.id,
      filename: photo.filename,
      folderId: photo.folderId,
      relativePath: photo.relativePath,
      watermarkedUrl
    };
  });

  return {
    ...stored,
    coverImageUrl: objectUrls.get(stored.coverPhotoId) ?? photos[0]?.watermarkedUrl ?? "",
    photos
  };
}

export async function importFolderProject(input: ImportProjectInput): Promise<Project> {
  const imageFiles = input.files.filter(isImage);
  if (imageFiles.length === 0) {
    throw new Error("Aucune image reconnue dans ce dossier.");
  }

  const folderNames = Array.from(new Set(imageFiles.map((file) => getFolderName(getRelativePath(file)))));
  const folders = buildFolderHierarchy(folderNames, `local-${Date.now()}-${slugify(input.projectName) || "projet"}`);
  const projectId = folders.length > 0 ? folders[0].id.split("-folder-")[0] : `local-${Date.now()}-${slugify(input.projectName) || "projet"}`;

  function folderIdForPath(relativePath: string): string {
    const parts = relativePath.split("/").filter(Boolean);
    const flatName = parts.length <= 2 ? "Photos" : parts.slice(1, -1).join(" / ");
    const parts2 = flatName.split(" / ");
    if (parts2.length === 1) {
      return folders.find((f) => f.name === parts2[0] && !f.parentId)?.id || folders[0]?.id || "";
    }
    const parent = folders.find((f) => f.name === parts2[0] && !f.parentId);
    if (!parent) return folders[0]?.id || "";
    const leaf = folders.find((f) => f.name === parts2[parts2.length - 1] && f.parentId === parent.id);
    return leaf?.id || parent.id;
  }

  const photos: StoredPhoto[] = imageFiles.map((file, index) => {
    const relativePath = getRelativePath(file);
    return {
      id: `${projectId}-photo-${index + 1}`,
      filename: file.name,
      folderId: folderIdForPath(relativePath),
      relativePath,
      blob: file
    };
  });

  const stored: StoredProject = {
    id: projectId,
    coupleName: input.projectName,
    eventDate: input.eventDate,
    venue: input.venue,
    passwordHash: "",
    accessCode: input.accessCode,
    eventType: input.eventType,
    notificationEmail: input.notificationEmail,
    notificationWhatsapp: input.notificationWhatsapp,
    source: "local",
    coverPhotoId: photos[0].id,
    quotas: input.quotas,
    priceGrid: defaultPriceGrid,
    folders,
    photos
  };

  const db = await openProjectsDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(stored);
  await transactionDone(transaction);
  db.close();

  return hydrateStoredProject(stored);
}

function sortStudioFolders(a: string, b: string): number {
  const order = ["dote", "mairie", "eglise", "soiree"];
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const ia = order.indexOf(normalize(a));
  const ib = order.indexOf(normalize(b));
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return a.localeCompare(b);
}

function buildFolderHierarchy(flatNames: string[], projectId: string): Folder[] {
  const roots: { name: string; path: string; children: { name: string; path: string }[] }[] = [];

  for (const flat of flatNames) {
    const parts = flat.split(" / ");
    if (parts.length === 1) {
      if (!roots.find((r) => r.name === parts[0]))
        roots.push({ name: parts[0], path: parts[0], children: [] });
    } else {
      let root = roots.find((r) => r.name === parts[0]);
      if (!root) {
        root = { name: parts[0], path: parts[0], children: [] };
        roots.push(root);
      }
      for (let i = 1; i < parts.length; i++) {
        const childPath = parts.slice(0, i + 1).join(" / ");
        if (!root.children.find((c) => c.path === childPath)) {
          root.children.push({ name: parts[i], path: childPath });
        }
      }
    }
  }

  roots.sort((a, b) => sortStudioFolders(a.name, b.name));

  const result: Folder[] = [];
  let order = 0;

  for (const root of roots) {
    const rootId = `${projectId}-folder-${order}-${slugify(root.name)}`;
    result.push({ id: rootId, name: root.name, displayOrder: order++ });
    for (const child of root.children) {
      const childId = `${projectId}-folder-${order}-${slugify(child.name)}`;
      result.push({ id: childId, name: child.name, parentId: rootId, displayOrder: order++ });
    }
  }

  return result;
}

export async function loadLocalProjects(): Promise<Project[]> {
  const db = await openProjectsDb();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).getAll();
  const projects = await new Promise<StoredProject[]>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredProject[]);
  });
  db.close();
  return projects.map(hydrateStoredProject);
}

export async function deleteLocalProject(projectId: string): Promise<void> {
  const db = await openProjectsDb();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(projectId);
  await transactionDone(transaction);
  db.close();
}
