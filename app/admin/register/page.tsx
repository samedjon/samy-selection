"use client";

import { Lock, LogIn, Mail, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      let data: any = { ok: false, message: "Reponse serveur vide." };
      try { data = await response.json(); } catch { setError("Erreur de lecture de la reponse."); return; }

      if (!response.ok || !data.ok) {
        setError(data.message || "Erreur lors de la creation du compte.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/admin/login"), 2000);
    } catch {
      setError("Erreur de connexion.");
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-studio px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lift ring-1 ring-black/5">
          <div className="grid place-items-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-leaf text-white">
              <UserPlus size={26} />
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-black">Compte cree</h1>
          <p className="mt-2 text-sm text-ink/60">Redirection vers la page de connexion...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-studio px-4">
      <div className="w-full max-w-sm">
        <form className="rounded-lg bg-white p-6 shadow-lift ring-1 ring-black/5" onSubmit={handleSubmit}>
          <div className="grid place-items-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-ink">
              <UserPlus className="text-gold" size={26} />
            </div>
          </div>
          <h1 className="mt-4 text-center text-2xl font-black">Creer un compte</h1>
          <p className="mt-1 text-center text-sm text-ink/60">Inscris-toi pour acceder au studio</p>

          <label className="mt-6 block text-sm font-bold text-ink/75" htmlFor="reg-name">Nom complet</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 bg-studio px-3">
            <User size={18} className="text-ink/40" />
            <input
              autoFocus
              className="h-12 w-full bg-transparent outline-none"
              id="reg-name"
              placeholder="Ex: Samy Production"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <label className="mt-4 block text-sm font-bold text-ink/75" htmlFor="reg-email">Adresse email</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 bg-studio px-3">
            <Mail size={18} className="text-ink/40" />
            <input
              className="h-12 w-full bg-transparent outline-none"
              id="reg-email"
              type="email"
              placeholder="studio@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <label className="mt-4 block text-sm font-bold text-ink/75" htmlFor="reg-password">Mot de passe</label>
          <input
            className="mt-1 h-12 w-full rounded-lg border border-ink/15 bg-studio px-3 outline-none"
            id="reg-password"
            type="password"
            placeholder="Au moins 6 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <p className="mt-4 rounded-lg bg-clay/10 p-3 text-sm font-semibold text-clay">{error}</p> : null}

          <button
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink font-black text-white disabled:opacity-60"
            disabled={!name || !email || !password || isLoading}
            type="submit"
          >
            <LogIn size={18} />
            {isLoading ? "Inscription..." : "Creer mon compte"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink/50">
          Deja un compte ?{" "}
          <Link className="font-black text-ink underline" href="/admin/login">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
