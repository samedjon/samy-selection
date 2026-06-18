"use client";

import { Lock, X } from "lucide-react";
import type { Project } from "@/types/selection";

export default function PasswordModal(props: {
  authError: string;
  isAuthenticating: boolean;
  password: string;
  project: Project;
  setPassword: (value: string) => void;
  unlockProject: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/55 p-3 backdrop-blur-sm sm:place-items-center">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lift">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-clay">Acces protege</p>
            <h2 className="mt-1 text-2xl font-black">{props.project.coupleName}</h2>
          </div>
          <button aria-label="Fermer" className="grid h-10 w-10 place-items-center rounded-full bg-ink/5" onClick={props.onClose}>
            <X size={20} />
          </button>
        </div>
        <label className="mt-5 block text-sm font-bold text-ink/75" htmlFor="password">Code client 4 chiffres</label>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-ink/15 bg-studio px-3">
          <Lock size={18} />
          <input
            autoFocus
            className="h-14 w-full bg-transparent text-2xl font-black tracking-[0.4em] outline-none"
            id="password"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]*"
            value={props.password}
            onChange={(event) => props.setPassword(event.target.value.replace(/\D/g, ""))}
          />
        </div>
        {props.authError ? <p className="mt-3 text-sm font-semibold text-clay">{props.authError}</p> : null}
        <button
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-base font-black text-white disabled:opacity-50"
          disabled={props.password.length !== 4 || props.isAuthenticating}
          onClick={props.unlockProject}
        >
          <Lock size={18} />
          {props.isAuthenticating ? "Verification..." : "Entrer dans la galerie"}
        </button>
        {props.project.source === "demo" && props.project.accessCode ? (
          <p className="mt-3 text-center text-xs text-ink/50">Code prevu : {props.project.accessCode}</p>
        ) : (
          <p className="mt-3 text-center text-xs text-ink/50">Renseigne le mot de passe qui t&apos;a ete envoye en prive.</p>
        )}
      </div>
    </div>
  );
}
