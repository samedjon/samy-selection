import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export function requireAdminAuth(): NextResponse | null {
  const cookieStore = cookies();
  const raw = cookieStore.get("samy_admin_session")?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, message: "Non autorise." }, { status: 401 });
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.email && parsed.name) return null;
  } catch {
    if (raw === "authenticated") return null;
  }
  return NextResponse.json({ ok: false, message: "Non autorise." }, { status: 401 });
}

export function getCurrentUser(): { email: string; name: string } | null {
  const cookieStore = cookies();
  const raw = cookieStore.get("samy_admin_session")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.email && parsed.name) return { email: parsed.email, name: parsed.name };
  } catch {
    // old format, ignore
  }
  return null;
}
