import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail, verifyPassword } from "@/lib/user-store";
import { logInfo, logWarn, logError } from "@/lib/session-logger";

const schema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(4, "Mot de passe trop court")
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Donnees invalides";
      await logWarn("auth", "Validation echouee", { errors: parsed.error.errors.map((e) => e.message) });
      return NextResponse.json({ ok: false, message: firstError }, { status: 400 });
    }

    const user = await findUserByEmail(parsed.data.email);
    if (!user) {
      await logWarn("auth", "Tentative connexion email inconnu", { email: parsed.data.email });
      return NextResponse.json({
        ok: false,
        message: "Email ou mot de passe incorrect.",
        noAccount: true
      }, { status: 401 });
    }

    const matches = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!matches) {
      await logWarn("auth", "Mot de passe incorrect", { email: parsed.data.email });
      return NextResponse.json({
        ok: false,
        message: "Email ou mot de passe incorrect.",
        noAccount: false
      }, { status: 401 });
    }

    cookies().set("samy_admin_session", JSON.stringify({ email: user.email, name: user.name }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/"
    });

    await logInfo("auth", "Connexion reussie", { email: user.email, name: user.name });
    return NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  } catch (error) {
    await logError("auth", "Erreur connexion", { error: String(error) });
    return NextResponse.json({ ok: false, message: "Erreur serveur" }, { status: 500 });
  }
}
