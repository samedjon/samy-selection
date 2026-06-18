import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser, findUserByEmail } from "@/lib/user-store";
import { logInfo, logWarn, logError } from "@/lib/session-logger";

const schema = z.object({
  name: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caracteres")
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || "Donnees invalides";
      await logWarn("register", "Validation echouee", { errors: parsed.error.errors.map((e) => e.message) });
      return NextResponse.json({ ok: false, message: firstError }, { status: 400 });
    }

    const existing = await findUserByEmail(parsed.data.email);
    if (existing) {
      await logWarn("register", "Email deja utilise", { email: parsed.data.email });
      return NextResponse.json({ ok: false, message: "Un compte avec cet email existe deja." }, { status: 409 });
    }

    const user = await createUser(parsed.data.email, parsed.data.name, parsed.data.password);
    await logInfo("register", "Compte cree", { email: user.email, name: user.name });
    return NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  } catch (error) {
    await logError("register", "Erreur creation compte", { error: String(error) });
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erreur lors de la creation du compte." }, { status: 500 });
  }
}
