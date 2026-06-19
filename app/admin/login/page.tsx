"use client";

import { Lock, LogIn, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [noAccount, setNoAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNoAccount(false);
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      let data: any = { ok: false, message: "Reponse serveur vide." };
      try { data = await response.json(); } catch { setError("Erreur de lecture de la reponse."); return; }

      if (!response.ok || !data.ok) {
        setError(data.message || "Email ou mot de passe incorrect.");
        if (data.noAccount) setNoAccount(true);
        return;
      }

      const redirect = searchParams.get("redirect") || "/admin";
      router.push(redirect);
    } catch {
      setError("Erreur de connexion.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <form className="rounded-lg bg-white p-6 shadow-lift ring-1 ring-black/5" onSubmit={handleSubmit}>
        <div className="grid place-items-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-ink">
            <Lock className="text-gold" size={26} />
          </div>
        </div>
        <h1 className="mt-4 text-center text-2xl font-black">Espace Studio</h1>
        <p className="mt-1 text-center text-sm text-ink/60">Connecte-toi pour gerer les galeries</p>

        <label className="mt-6 block text-sm font-bold text-ink/75" htmlFor="login-email">Adresse email</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 bg-studio px-3">
          <Mail size={18} className="text-ink/40" />
          <input
            autoFocus
            className="h-12 w-full bg-transparent outline-none"
            id="login-email"
            type="email"
            placeholder="studio@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <label className="mt-4 block text-sm font-bold text-ink/75" htmlFor="login-password">Mot de passe</label>
        <input
          className="mt-1 h-12 w-full rounded-lg border border-ink/15 bg-studio px-3 outline-none"
          id="login-password"
          type="password"
          placeholder="Entrer le mot de passe"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? (
          <div className="mt-4 rounded-lg bg-clay/10 p-3 text-sm">
            <p className="font-semibold text-clay">{error}</p>
            {noAccount ? (
              <Link className="mt-2 flex items-center gap-2 font-black text-ink underline" href="/admin/register">
                <UserPlus size={16} />
                Creer un compte studio
              </Link>
            ) : null}
          </div>
        ) : null}

        <button
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink font-black text-white disabled:opacity-60"
          disabled={!email || !password || isLoading}
          type="submit"
        >
          <LogIn size={18} />
          {isLoading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink/50">
        Pas encore de compte ?{" "}
        <Link className="font-black text-ink underline" href="/admin/register">
          Creer un compte
        </Link>
      </p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-studio px-4">
      <Suspense fallback={<div className="text-ink/60">Chargement...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
