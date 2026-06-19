import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getDataDir } from "./data-dir";

export type SavedSelection = {
  id: string;
  projectId: string;
  coupleName: string;
  selections: { start: string[]; premium: string[]; enlargement: string[] };
  message: string;
  extraCount: number;
  extraPrice: number;
  timestamp: string;
  status: "confirmed";
};

type SelectionsData = { selections: SavedSelection[] };

const dataDir = getDataDir();
const selectionsFile = path.join(dataDir, "selections.json");

async function readSelections(): Promise<SavedSelection[]> {
  try {
    const raw = await readFile(selectionsFile, "utf8");
    const parsed = JSON.parse(raw) as SelectionsData;
    return parsed.selections ?? [];
  } catch {
    return [];
  }
}

async function writeSelections(selections: SavedSelection[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(selectionsFile, JSON.stringify({ selections }, null, 2), "utf8");
}

export async function saveSelection(entry: Omit<SavedSelection, "id" | "timestamp">): Promise<SavedSelection> {
  const saved: SavedSelection = {
    ...entry,
    id: `sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString()
  };
  const existing = await readSelections();
  existing.unshift(saved);
  await writeSelections(existing);
  return saved;
}

export async function listAllSelections(): Promise<SavedSelection[]> {
  return readSelections();
}

export async function getSelectionById(id: string): Promise<SavedSelection | undefined> {
  const list = await readSelections();
  return list.find((s) => s.id === id);
}

export async function getSelectionsByProject(projectId: string): Promise<SavedSelection[]> {
  const list = await readSelections();
  return list.filter((s) => s.projectId === projectId);
}
