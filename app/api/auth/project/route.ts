import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findProject } from "@/lib/demo-data";
import { findServerProject } from "@/lib/server-project-store";
import { checkRateLimit } from "@/lib/rate-limiter";

const schema = z.object({
  projectId: z.string().min(1),
  password: z.string().regex(/^\d{4}$/)
});

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`auth:${clientIp}`);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil((rateCheck.resetAt - Date.now()) / 60_000);
      return NextResponse.json({
        ok: false,
        message: `Trop de tentatives. Reessayez dans ${minutes} minute(s).`
      }, {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000))
        }
      });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Acces refuse" }, { status: 400 });
    }

    const project = findProject(parsed.data.projectId) ?? (await findServerProject(parsed.data.projectId));
    if (!project) {
      return NextResponse.json({ ok: false, message: "Acces refuse" }, { status: 404 });
    }

    const matches = await bcrypt.compare(parsed.data.password, project.passwordHash);
    if (!matches) {
      return NextResponse.json({ ok: false, message: "Acces refuse" }, { status: 401 });
    }

    cookies().set(`samy_selection_${project.id}`, "demo-session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 2,
      path: "/"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("project auth failed", error);
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
