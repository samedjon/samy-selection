import { NextResponse } from "next/server";
import { listActiveServerProjects } from "@/lib/server-project-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await listActiveServerProjects();
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json([]);
  }
}