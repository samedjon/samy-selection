import "server-only";
import { mkdir, readFile, writeFile, appendFile } from "fs/promises";
import path from "path";
import { getDataDir } from "./data-dir";

export type LogLevel = "info" | "warn" | "error" | "debug";

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
};

const dataDir = getDataDir();
const logDir = path.join(dataDir, "logs");
const logFile = path.join(logDir, "session.log");
const entriesFile = path.join(logDir, "entries.json");

let inMemoryBuffer: LogEntry[] = [];

export async function log(
  level: LogLevel,
  category: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details
  };

  inMemoryBuffer.push(entry);

  const line = `[${entry.timestamp}] [${level.toUpperCase()}] [${category}] ${message}${details ? " " + JSON.stringify(details) : ""}`;

  try {
    await mkdir(logDir, { recursive: true });
    await appendFile(logFile, line + "\n", "utf8");

    const existing = await readEntriesRaw();
    existing.push(entry);
    const keep = existing.slice(-500);
    await writeFile(entriesFile, JSON.stringify(keep, null, 2), "utf8");
  } catch {
    // Silently fail if logging itself fails
  }
}

async function readEntriesRaw(): Promise<LogEntry[]> {
  try {
    const raw = await readFile(entriesFile, "utf8");
    return JSON.parse(raw) as LogEntry[];
  } catch {
    return [];
  }
}

export async function getRecentLogs(count = 100): Promise<LogEntry[]> {
  const entries = await readEntriesRaw();
  return entries.slice(-count);
}

export async function getLogsByCategory(category: string, count = 50): Promise<LogEntry[]> {
  const entries = await readEntriesRaw();
  return entries.filter((e) => e.category === category).slice(-count);
}

export async function getLogsByLevel(level: LogLevel, count = 50): Promise<LogEntry[]> {
  const entries = await readEntriesRaw();
  return entries.filter((e) => e.level === level).slice(-count);
}

export function getInMemoryLogs(): LogEntry[] {
  return [...inMemoryBuffer];
}

// Convenience helpers
export async function logInfo(category: string, message: string, details?: Record<string, unknown>) {
  return log("info", category, message, details);
}

export async function logWarn(category: string, message: string, details?: Record<string, unknown>) {
  return log("warn", category, message, details);
}

export async function logError(category: string, message: string, details?: Record<string, unknown>) {
  return log("error", category, message, details);
}

export async function logDebug(category: string, message: string, details?: Record<string, unknown>) {
  return log("debug", category, message, details);
}
