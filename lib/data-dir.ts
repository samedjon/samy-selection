import "server-only";
import path from "path";

const isNetlify = process.env.NETLIFY === "true" || process.cwd().startsWith("/var/task");

export function getDataDir(): string {
  if (isNetlify) {
    return path.join("/tmp", "data");
  }
  return path.join(process.cwd(), "data");
}
