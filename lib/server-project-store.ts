import "server-only";

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { Folder, Photo, PriceTier, Project, SelectionType } from "@/types/selection";
import { createClient } from "@/lib/supabase/server";

const dataDir = path.join(process.cwd(), "data");
const projectsFile = path.join(dataDir, "projects.json");
const uploadsDir = path.join(process.cwd(), "public", "uploads");

const defaultPriceGrid: PriceTier[] = [
  { min: 1, max: 50, unitPrice: 1000 },
  { min: 51, max: 200, unitPrice: 700 },
  { min: 201, max: 500, unitPrice: 500 },
  { min: 501, max: 1000, unitPrice: 300 },
  { min: 1001, max: null, unitPrice: 100 }
];

export type CreateServerProjectInput = {
  accessCode: string;
  eventDate: string;
  eventType: string;
  files: Array<{ file: File; relativePath: string }>;
  notificationEmail: string;
  notificationWhatsapp: string;
  driveUrl: string;
  projectName: string;
  quotas: Record<SelectionType, number>;
  venue: string;
  cloudinaryPhotos?: Array<{
    originalRelativePath: string;
    watermarkedUrl: string;
    cloudinaryPublicId: string;
  }>;
};

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
  const rootId = `${projectId}-folder-root`;
  const roots: { name: string; path: string; children: { name: string; path: string }[] }[] = [];
  const pathToId = new Map<string, string>();

  for (const flat of flatNames) {
    const parts = flat.split(" / ");
    if (parts.length === 1) {
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
    pathToId.set(root.path, rootId);
    result.push({ id: rootId, name: root.name, displayOrder: order++ });
    for (const child of root.children) {
      const childId = `${projectId}-folder-${order}-${slugify(child.name)}`;
      pathToId.set(child.path, childId);
      result.push({ id: childId, name: child.name, parentId: rootId, displayOrder: order++ });
    }
  }

  return result;
}

function cleanFilename(filename: string): string {
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);
  return `${slugify(basename)}${extension.toLowerCase() || ".jpg"}`;
}

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return url !== "" && key !== "" && !url.includes("votre-projet") && !key.includes("votre-cle");
}

// ---- Supabase helpers ----

async function fetchProjectsFromSupabase(): Promise<Project[]> {
  const supabase = createClient();
  const { data: projectsData, error: projectsError } = await supabase
    .from("projects")
    .select("*, folders(*), photos(*)")
    .order("created_at", { ascending: false });

  if (projectsError) throw projectsError;
  if (!projectsData) return [];

  return projectsData.map(mapSupabaseProject);
}

function mapSupabaseProject(row: any): Project {
  return {
    id: row.id,
    coupleName: row.couple_name,
    eventDate: row.event_date,
    venue: row.venue || "",
    coverImageUrl: row.cover_image_url || "",
    passwordHash: row.password_hash,
    accessCode: undefined,
    eventType: row.event_type || "Mariage",
    notificationEmail: row.notification_email || "",
    notificationWhatsapp: row.notification_whatsapp || "",
    driveUrl: row.drive_url || "",
    isArchived: !row.is_active,
    source: "server",
    quotas: {
      start: row.quota_start,
      premium: row.quota_premium,
      enlargement: row.quota_enlargement
    },
    priceGrid: (row.price_grid || []) as PriceTier[],
    folders: (row.folders || []).map((f: any): Folder => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id || undefined,
      displayOrder: f.display_order
    })),
    photos: (row.photos || []).map((p: any): Photo => ({
      id: p.id,
      filename: p.filename,
      folderId: p.folder_id,
      watermarkedUrl: p.watermarked_url,
      relativePath: p.original_url
    }))
  };
}

async function findProjectFromSupabase(projectId: string): Promise<Project | undefined> {
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("projects")
    .select("*, folders(*), photos(*)")
    .eq("id", projectId)
    .single();

  if (error || !row) return undefined;
  return mapSupabaseProject(row);
}

async function createProjectInSupabase(input: CreateServerProjectInput, photos: Photo[], folders: Folder[]): Promise<Project> {
  const supabase = createClient();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const priceGridJson = JSON.stringify(defaultPriceGrid);

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .insert({
      couple_name: input.projectName.trim(),
      event_date: input.eventDate,
      event_type: input.eventType,
      venue: input.venue,
      password_hash: await bcrypt.hash(input.accessCode, 10),
      quota_start: input.quotas.start,
      quota_premium: input.quotas.premium,
      quota_enlargement: input.quotas.enlargement,
      price_grid: priceGridJson,
      cover_image_url: photos[0]?.watermarkedUrl || "",
      notification_email: input.notificationEmail,
      notification_whatsapp: input.notificationWhatsapp,
      drive_url: input.driveUrl,
      is_active: true
    })
    .select("id")
    .single();

  if (projectError || !projectRow) {
    throw new Error(`Supabase insert failed: ${projectError?.message || "unknown"}`);
  }

  const projectId = projectRow.id;

  const folderRows = await Promise.all(
    folders.map(async (folder, index) => {
      const { data, error } = await supabase
        .from("folders")
        .insert({
          project_id: projectId,
          name: folder.name,
          display_order: index + 1
        })
        .select("id")
        .single();

      if (error) throw error;
      return { ...folder, id: data.id };
    })
  );

  const folderIdMap = new Map(folders.map((f, i) => [f.id, folderRows[i].id]));

  const photoRows = await Promise.all(
    photos.map(async (photo, index) => {
      const { data, error } = await supabase
        .from("photos")
        .insert({
          folder_id: folderIdMap.get(photo.folderId) || folderRows[0].id,
          filename: photo.filename,
          cloudinary_public_id: "",
          watermarked_url: photo.watermarkedUrl,
          original_url: photo.relativePath || "",
          display_order: index + 1
        })
        .select("id")
        .single();

      if (error) throw error;
      return { ...photo, id: data.id };
    })
  );

  return {
    id: projectId,
    coupleName: input.projectName.trim(),
    eventDate: input.eventDate,
    venue: input.venue,
    coverImageUrl: photos[0]?.watermarkedUrl || "",
    passwordHash: "",
    accessCode: input.accessCode,
    eventType: input.eventType,
    notificationEmail: input.notificationEmail,
    notificationWhatsapp: input.notificationWhatsapp,
    driveUrl: input.driveUrl,
    isArchived: false,
    source: "server",
    quotas: input.quotas,
    priceGrid: defaultPriceGrid,
    folders: folderRows,
    photos: photoRows
  };
}

async function updateProjectInSupabase(projectId: string, patch: Partial<Project>): Promise<Project | undefined> {
  const supabase = createClient();
  const updates: Record<string, any> = {};

  if (patch.coupleName !== undefined) updates.couple_name = patch.coupleName;
  if (patch.coverImageUrl !== undefined) updates.cover_image_url = patch.coverImageUrl;
  if (patch.eventType !== undefined) updates.event_type = patch.eventType;
  if (patch.venue !== undefined) updates.venue = patch.venue;
  if (patch.notificationEmail !== undefined) updates.notification_email = patch.notificationEmail;
  if (patch.notificationWhatsapp !== undefined) updates.notification_whatsapp = patch.notificationWhatsapp;
  if (patch.driveUrl !== undefined) updates.drive_url = patch.driveUrl;
  if (patch.isArchived !== undefined) updates.is_active = !patch.isArchived;

  if (Object.keys(updates).length === 0) return findProjectFromSupabase(projectId);

  const { error } = await supabase.from("projects").update(updates).eq("id", projectId);
  if (error) throw error;

  return findProjectFromSupabase(projectId);
}

async function deleteProjectFromSupabase(projectId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  return !error;
}

// ---- JSON file helpers ----

async function readProjects(): Promise<Project[]> {
  try {
    const raw = await readFile(projectsFile, "utf8");
    const parsed = JSON.parse(raw) as Project[] | Project;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function writeProjects(projects: Project[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(projectsFile, JSON.stringify(projects, null, 2), "utf8");
}

// ---- Exports (dual mode) ----

export async function listServerProjects(): Promise<Project[]> {
  if (isSupabaseConfigured()) {
    return fetchProjectsFromSupabase();
  }
  const projects = await readProjects();
  return projects.sort((a, b) => b.id.localeCompare(a.id));
}

export async function listActiveServerProjects(): Promise<Project[]> {
  if (isSupabaseConfigured()) {
    const all = await fetchProjectsFromSupabase();
    return all.filter((p) => !p.isArchived);
  }
  const projects = await listServerProjects();
  return projects.filter((project) => !project.isArchived);
}

export async function findServerProject(projectId: string): Promise<Project | undefined> {
  if (isSupabaseConfigured()) {
    return findProjectFromSupabase(projectId);
  }
  const projects = await readProjects();
  return projects.find((project) => project.id === projectId);
}

export async function createServerProject(input: CreateServerProjectInput): Promise<Project> {
  const imageFiles = input.files.filter(
    ({ file }) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name)
  );
  if (imageFiles.length === 0) {
    throw new Error("Aucune image valide dans le dossier choisi.");
  }

  const projectSlug = slugify(input.projectName);
  const projectId = `${Date.now()}-${projectSlug}`;
  const projectUploadDir = path.join(uploadsDir, projectId);
  const passwordHash = await bcrypt.hash(input.accessCode, 10);

  const folderNames = Array.from(
    new Set(imageFiles.map(({ relativePath }) => getFolderName(relativePath)))
  );

  const folders = buildFolderHierarchy(folderNames, projectId);
  const folderIdByName = new Map<string, string>();
  for (const f of folders) {
    for (const flat of folderNames) {
      if (flat.endsWith(f.name) || flat === f.name || flat.split(" / ").includes(f.name)) {
        folderIdByName.set(flat, f.id);
        break;
      }
    }
  }

  // For photos, find the correct folder id from the full path
  function folderIdForPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    const flatName = parts.length <= 2 ? "Photos" : parts.slice(1, -1).join(" / ");
    const leaf = flatName.split(" / ").pop() || flatName;
    const match = folders.find((f) => f.name === leaf && !f.parentId) || folders.find((f) => f.name === leaf) || folders.find((f) => flatName.endsWith(f.name)) || folders[0];
    return match.id;
  }

  const cloudinaryMap = new Map<string, { url: string; publicId: string }>();
  if (input.cloudinaryPhotos) {
    for (const cp of input.cloudinaryPhotos) {
      cloudinaryMap.set(cp.originalRelativePath, {
        url: cp.watermarkedUrl,
        publicId: cp.cloudinaryPublicId
      });
    }
  }

  const photos: Photo[] = [];
  for (const [index, item] of imageFiles.entries()) {
    const folderId = folderIdForPath(item.relativePath);
    const folderName = getFolderName(item.relativePath);
    const folderSlug = slugify(folderName);
    const fileName = `${String(index + 1).padStart(4, "0")}-${cleanFilename(item.file.name)}`;

    const cloudinaryEntry = cloudinaryMap.get(item.relativePath);
    if (cloudinaryEntry) {
      photos.push({
        id: `${projectId}-photo-${index + 1}-${randomUUID().slice(0, 8)}`,
        filename: item.file.name,
        folderId,
        relativePath: item.relativePath,
        watermarkedUrl: cloudinaryEntry.url
      });
      continue;
    }

    const destinationDir = path.join(projectUploadDir, folderSlug);
    const destination = path.join(destinationDir, fileName);

    await mkdir(destinationDir, { recursive: true });
    await writeFile(destination, Buffer.from(await item.file.arrayBuffer()));

    const url = `/uploads/${projectId}/${folderSlug}/${encodeURIComponent(fileName)}`;
    photos.push({
      id: `${projectId}-photo-${index + 1}-${randomUUID().slice(0, 8)}`,
      filename: item.file.name,
      folderId,
      relativePath: item.relativePath,
      watermarkedUrl: url
    });
  }

  const project: Project = {
    id: projectId,
    accessCode: input.accessCode,
    coupleName: input.projectName.trim(),
    coverImageUrl: photos[0]?.watermarkedUrl ?? "",
    driveUrl: input.driveUrl,
    eventDate: input.eventDate,
    eventType: input.eventType,
    folders,
    isArchived: false,
    notificationEmail: input.notificationEmail,
    notificationWhatsapp: input.notificationWhatsapp,
    passwordHash,
    photos,
    priceGrid: defaultPriceGrid,
    quotas: input.quotas,
    source: "server",
    venue: input.venue
  };

  if (isSupabaseConfigured()) {
    return createProjectInSupabase(input, photos, folders);
  }

  const projects = await readProjects();
  projects.unshift(project);
  await writeProjects(projects);
  return project;
}

export async function updateServerProject(projectId: string, patch: Partial<Project>): Promise<Project | undefined> {
  if (isSupabaseConfigured()) {
    return updateProjectInSupabase(projectId, patch);
  }

  const projects = await readProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) return undefined;

  projects[index] = {
    ...projects[index],
    ...patch,
    id: projects[index].id,
    photos: projects[index].photos,
    folders: projects[index].folders,
    passwordHash: projects[index].passwordHash
  };
  await writeProjects(projects);
  return projects[index];
}

export async function deleteServerProject(projectId: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return deleteProjectFromSupabase(projectId);
  }

  const projects = await readProjects();
  const nextProjects = projects.filter((project) => project.id !== projectId);
  if (nextProjects.length === projects.length) return false;

  await writeProjects(nextProjects);
  await rm(path.join(uploadsDir, projectId), { force: true, recursive: true });
  return true;
}
