"use client";

import { LogOut, Sparkles, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import StudioAdmin from "@/components/studio-admin";

export default function AdminHome({ user }: { user: { email: string; name: string } | null }) {
  const [entered, setEntered] = useState(false);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-studio px-4">
        <div className="w-full max-w-sm text-center">
          <div className="grid place-items-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-ink">
              <User className="text-gold" size={30} />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-black">Connexion requise</h1>
          <p className="mt-2 text-sm text-ink/60">Connecte-toi pour acceder a l&apos;espace studio.</p>
          <div className="mt-6 grid gap-3">
            <Link className="flex h-14 items-center justify-center gap-2 rounded-lg bg-ink font-black text-white" href="/admin/login">
              Se connecter
            </Link>
            <Link className="flex h-14 items-center justify-center gap-2 rounded-lg bg-studio font-black text-ink ring-1 ring-black/10" href="/admin/register">
              <UserPlus size={18} /> Creer un compte
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!entered) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-studio px-4">
        <div className="w-full max-w-sm text-center">
          <div className="grid place-items-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-leaf text-white">
              <Sparkles size={30} />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-black">Bonjour {user.name.split(" ")[0]} !</h1>
          <p className="mt-2 text-sm text-ink/60">
            Bienvenue dans l&apos;espace studio Samy Production 237.
          </p>
          <p className="mt-1 text-xs text-ink/40">{user.email}</p>
          <div className="mt-8 grid gap-3">
            <button
              className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-ink font-black text-white"
              onClick={() => setEntered(true)}
            >
              <Sparkles size={18} /> Commencons
            </button>
            <Link className="flex h-14 items-center justify-center gap-2 rounded-lg bg-studio px-4 font-black text-ink ring-1 ring-black/10" href="/admin/login">
              <LogOut size={18} /> Changer de compte
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <StudioAdmin user={user} />;
}
