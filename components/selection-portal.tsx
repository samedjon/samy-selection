"use client";

import { Check, ChevronLeft, ChevronRight, Crown, Eye, Images, Maximize2, Pencil, Send, ShieldCheck, Sparkles, Square, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Photo, Project, SelectionState, SelectionType } from "@/types/selection";
import { calculateExtraPrice } from "@/lib/demo-data";
import { loadLocalProjects, deleteLocalProject } from "@/lib/local-project-store";
import { buildStudioMessage } from "@/lib/whatsapp";
import PasswordModal from "@/components/password-modal";
import FolderTree from "@/components/folder-tree";
import ImageViewer from "@/components/image-viewer";

type Step = "gallery" | "free" | "start" | "premium" | "enlargement" | "summary" | "confirmed";
type PhotoSource = "all" | "start";

const emptySelection: SelectionState = { start: [], premium: [], enlargement: [] };

const stepConfig: Record<string, { title: string; short: string; hint: string }> = {
  start: {
    title: "Selection Start",
    short: "Start",
    hint: "Selectionne les photos a retoucher en Start (correction lumiere & couleurs)."
  },
  premium: {
    title: "Photos Premium",
    short: "Premium",
    hint: "Choisis les photos qui meritent une retouche approfondie."
  },
  enlargement: {
    title: "Agrandissements",
    short: "Agrand.",
    hint: "Choisis les photos a tirer en grand format."
  }
};

const stepOrder: Step[] = ["free", "start", "premium", "enlargement", "summary"];

export default function SelectionPortal({ projects, isAdmin, adminUser }: {
  projects: Project[];
  isAdmin?: boolean;
  adminUser?: { email: string; name: string } | null;
}) {
  const [availableProjects, setAvailableProjects] = useState<Project[]>(projects);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [step, setStep] = useState<Step>("gallery");
  const [activeFolderId, setActiveFolderId] = useState(projects[0]?.folders[0]?.id ?? "");
  const [selections, setSelections] = useState<SelectionState>(emptySelection);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmedProject, setConfirmedProject] = useState<Project | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flowMessage, setFlowMessage] = useState("");

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<Photo[]>([]);

  const [premiumSource, setPremiumSource] = useState<PhotoSource>("all");
  const [enlargementSource, setEnlargementSource] = useState<PhotoSource>("start");

  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const [showQuotaHelp, setShowQuotaHelp] = useState(false);

  // Summary validation
  const [confirmBlocked, setConfirmBlocked] = useState(false);
  const [confirmBlockerMessage, setConfirmBlockerMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadLocalProjects()
      .then((localProjects) => {
        if (!cancelled) setAvailableProjects((prev) => {
          const serverIds = new Set(prev.map((p) => p.id));
          const uniqueLocals = localProjects.filter((p) => !serverIds.has(p.id));
          return [...prev, ...uniqueLocals];
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projects]);

  useEffect(() => {
    if (!activeProject) return;
    const stored = window.localStorage.getItem(`samy-selection-${activeProject.id}`);
    if (stored) {
      try { setSelections(JSON.parse(stored) as SelectionState); } catch { setSelections(emptySelection); }
    }
  }, [activeProject]);

  useEffect(() => {
    if (!activeProject) return;
    window.localStorage.setItem(`samy-selection-${activeProject.id}`, JSON.stringify(selections));
  }, [activeProject, selections]);

  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    const handleVisibility = () => document.body.classList.toggle("samy-hidden", document.hidden);
    const handleBlur = () => document.body.classList.add("samy-hidden");
    const handleFocus = () => document.body.classList.remove("samy-hidden");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const currentType: SelectionType = step === "premium" ? "premium" : step === "enlargement" ? "enlargement" : "start";
  const quota = activeProject?.quotas[currentType] ?? 0;
  const startExtra = activeProject ? Math.max(0, selections.start.length - activeProject.quotas.start) : 0;
  const extraPrice = activeProject ? calculateExtraPrice(startExtra, activeProject) : 0;

  function getFolderDescendantIds(folderId: string): Set<string> {
    if (!activeProject) return new Set([folderId]);
    const ids = new Set([folderId]);
    const children = activeProject.folders.filter((f) => f.parentId === folderId);
    for (const child of children) {
      const desc = getFolderDescendantIds(child.id);
      desc.forEach((id) => ids.add(id));
    }
    return ids;
  }

  const visiblePhotos = useMemo(() => {
    if (!activeProject) return [];
    if (!activeFolderId) return activeProject.photos;
    let source = activeProject.photos;
    if (step === "premium") {
      source = premiumSource === "start" ? activeProject.photos.filter((p) => selections.start.includes(p.id)) : activeProject.photos;
    } else if (step === "enlargement") {
      source = enlargementSource === "start" ? activeProject.photos.filter((p) => selections.start.includes(p.id)) : activeProject.photos;
    }
    const folderIds = getFolderDescendantIds(activeFolderId);
    return source.filter((photo) => folderIds.has(photo.folderId));
  }, [activeProject, activeFolderId, step, selections.start, premiumSource, enlargementSource]);

  const allPhotosCount = activeProject?.photos.length ?? 0;

  const currentStepIdx = stepOrder.indexOf(step as any);
  const canGoNext = currentStepIdx >= 0 && currentStepIdx < stepOrder.length - 1 && step !== "free";
  const canGoPrev = currentStepIdx > 0;

  function enterProject(project: Project) {
    setActiveProject(project);
    setActiveFolderId("");
    setStep("free");
    setSelections(emptySelection);
  }

  async function unlockProject() {
    if (!pendingProject) return;
    if (isAdmin) {
      enterProject(pendingProject);
      setPendingProject(null);
      return;
    }
    setIsAuthenticating(true);
    setAuthError("");
    try {
      if (pendingProject.source === "local") {
        if (pendingProject.accessCode !== password) { setAuthError("Code incorrect."); return; }
        enterProject(pendingProject);
        setPendingProject(null);
        setPassword("");
        return;
      }
      const response = await fetch("/api/auth/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pendingProject.id, password })
      });
      if (!response.ok) { setAuthError("Code incorrect."); return; }
      enterProject(pendingProject);
      setPendingProject(null);
      setPassword("");
    } catch { setAuthError("Impossible de verifier le code."); }
    finally { setIsAuthenticating(false); }
  }

  function toggleSelect(photo: Photo) {
    setFlowMessage("");
    setQuotaWarning(null);
    const type = currentType;
    setSelections((current) => {
      const selected = current[type].includes(photo.id);
      if (selected) return { ...current, [type]: current[type].filter((id) => id !== photo.id) };
      const newCount = current[type].length + 1;
      const q = activeProject?.quotas[type] ?? 0;
      if (newCount > q) {
        setQuotaWarning(`Quota ${stepConfig[type]?.short || type} depasse (${newCount - q} en trop). Les photos supplementaires seront facturees en sus.`);
      }
      return { ...current, [type]: [...current[type], photo.id] };
    });
  }

  function openPreview(photo: Photo, photos: Photo[]) {
    const idx = photos.findIndex((p) => p.id === photo.id);
    setViewerIndex(idx);
    setViewerPhotos(photos);
    setViewerOpen(true);
  }

  function goNext() {
    if (!activeProject) return;
    setFlowMessage("");
    const idx = stepOrder.indexOf(step as any);
    if (idx >= 0 && idx < stepOrder.length - 1) {
      setStep(stepOrder[idx + 1]);
    }
  }

  function goPrev() {
    setFlowMessage("");
    const idx = stepOrder.indexOf(step as any);
    if (idx > 0) {
      setStep(stepOrder[idx - 1]);
    }
  }

  function goToStep(s: "start" | "premium" | "enlargement") {
    setFlowMessage("");
    setStep(s);
  }

  function handleConfirm() {
    if (!activeProject) return;
    const totalSelected = selections.start.length + selections.premium.length + selections.enlargement.length;
    if (totalSelected === 0) {
      setConfirmBlocked(true);
      setConfirmBlockerMessage("Vous n'avez selectionne aucune photo. Veuillez faire votre selection avant de confirmer.");
      return;
    }
    void confirmSelection();
  }

  function closeAllSelectionsOnProject(projectId: string) {
    window.localStorage.removeItem(`samy-selection-${projectId}`);
  }

  async function handleDeleteProject(projectId: string) {
    // Delete from both stores to ensure complete removal
    await Promise.allSettled([
      deleteLocalProject(projectId).catch(() => {}),
      fetch(`/api/admin/projects?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" }).catch(() => {})
    ]);
    setAvailableProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProject?.id === projectId) {
      setActiveProject(null);
      setStep("gallery");
    }
  }

  async function confirmSelection() {
    if (!activeProject) return;
    setIsSubmitting(true);
    try {
      if (activeProject.source === "local") {
        const msg = buildStudioMessage(activeProject, selections);
        await fetch("/api/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: activeProject.id, selections })
        });
        setConfirmMessage(msg);
        setConfirmedProject(activeProject);
        setStep("confirmed");
        closeAllSelectionsOnProject(activeProject.id);
        return;
      }
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject.id, selections })
      });
      let data: any = { message: "" };
      try { data = await response.json(); } catch { setConfirmMessage("Erreur de lecture de la reponse."); return; }
      setConfirmMessage(data.message ?? "");
      setConfirmedProject(activeProject);
      setStep("confirmed");
      closeAllSelectionsOnProject(activeProject.id);
    } catch { setConfirmMessage("Erreur lors de l'envoi."); }
    finally { setIsSubmitting(false); }
  }

  const showSidebar = step !== "summary" && step !== "confirmed";

  // --- RENDER ---
  if (!activeProject || step === "gallery") {
    return (
      <main className="min-h-screen bg-studio">
        <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6">
          <Header compact={false} isAdmin={isAdmin} />
          <div className="mt-4 flex justify-end">
            {isAdmin ? (
              <a className="rounded-full bg-ink px-4 py-2 text-sm font-black text-white" href="/admin">Tableau de bord</a>
            ) : (
              <a className="rounded-full bg-ink px-4 py-2 text-sm font-black text-white" href="/admin/login">Espace studio</a>
            )}
          </div>
          <div className="mt-6 grid flex-1 content-start gap-4 pb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-clay">Portail client</p>
              <h1 className="mt-2 text-4xl font-black leading-none text-ink sm:text-6xl">Selection photo</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink/70">Accede a ton reportage avec le code recu, parcours les images protegees et confirme la selection finale pour le studio.</p>
            </div>
            {availableProjects.length === 0 ? (
              <div className="rounded-lg bg-white p-6 text-center shadow-lift ring-1 ring-black/5">
                <p className="text-lg font-black text-ink/60">Aucune galerie disponible pour le moment.</p>
                <p className="mt-2 text-sm text-ink/50">Reviens plus tard ou contacte le studio.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {availableProjects.map((project) => (
                  <div key={project.id} className="group relative overflow-hidden rounded-lg bg-white text-left shadow-lift ring-1 ring-black/5">
                    <button className="block w-full" onClick={() => setPendingProject(project)}>
                      <div className="photo-protection relative aspect-[4/3] overflow-hidden">
                        <img alt={project.coupleName} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={project.coverImageUrl} />
                      </div>
                      <div className="grid gap-2 p-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-leaf">{project.eventType ?? "Mariage"}</span>
                        <strong className="text-2xl font-black">{project.coupleName}</strong>
                        <span className="text-sm text-ink/65">{project.venue} - {new Intl.DateTimeFormat("fr-FR").format(new Date(project.eventDate))} - {project.photos.length} photos</span>
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="absolute right-2 top-2 flex gap-1">
                        <button className="rounded-full bg-black/60 p-2 text-white hover:bg-clay"
                          onClick={() => void handleDeleteProject(project.id)}
                          title="Supprimer ce projet">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        {pendingProject ? (
          <PasswordModal authError={authError} isAuthenticating={isAuthenticating} password={password} project={pendingProject}
            setPassword={setPassword} unlockProject={unlockProject}
            onClose={() => { setPendingProject(null); setAuthError(""); setPassword(""); }} />
        ) : null}
      </main>
    );
  }

  const allFolders = activeProject.folders;

  return (
    <main className={clsx("min-h-screen pb-[calc(var(--bottom-bar-height)+24px)] transition-colors duration-500",
      step === "start" && "bg-gradient-to-b from-leaf/[0.04] to-studio",
      step === "premium" && "bg-gradient-to-b from-gold/[0.06] to-studio",
      step === "enlargement" && "bg-gradient-to-b from-clay/[0.05] to-studio",
      !["start", "premium", "enlargement"].includes(step) && "bg-studio"
    )}>
      <div className={clsx("mx-auto w-full max-w-7xl px-3 py-4 sm:px-6", showSidebar && "lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-5")}>
        {showSidebar && (
          <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-32px)] lg:overflow-y-auto">
            <Header compact isAdmin={isAdmin} />
            <div className="mt-4 hidden rounded-lg bg-white p-3 shadow-lift ring-1 ring-black/5 lg:block">
              <FolderTree folders={allFolders} photos={activeProject.photos} activeFolderId={activeFolderId} selectedIds={selections.start} onSelect={setActiveFolderId} />
            </div>
          </aside>
        )}

        <section className="min-w-0">
          <TopBar activeProject={activeProject} step={step}
            selections={selections} quotas={activeProject.quotas}
            onGoToStep={goToStep}
            onGoBack={() => step === "free" ? setStep("gallery") : goPrev()} />

          {["start", "premium", "enlargement"].includes(step) && (
            <div className="mb-4 flex gap-1 rounded-lg bg-white p-1 shadow-lift ring-1 ring-black/5">
              {(["start", "premium", "enlargement"] as const).map((s) => {
                const cfg = stepConfig[s];
                const active = step === s;
                const count = selections[s].length;
                return (
                  <button key={s}
                    className={clsx("flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-sm font-black transition",
                      active
                        ? s === "start" ? "bg-leaf text-white"
                        : s === "premium" ? "bg-gold text-ink"
                        : "bg-clay text-white"
                        : "text-ink/50 hover:text-ink"
                    )}
                    onClick={() => goToStep(s)}>
                    {cfg.short}
                    <span className={clsx("rounded-full px-2 py-0.5 text-xs",
                      active ? "bg-white/20" : "bg-ink/10")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === "free" && (
            <>
              <div className="sticky top-0 z-20 -mx-3 bg-studio/95 px-3 py-3 backdrop-blur lg:hidden">
                <FolderTree folders={allFolders} photos={activeProject.photos} activeFolderId={activeFolderId} selectedIds={selections.start} onSelect={setActiveFolderId} />
              </div>
              <FreeView project={activeProject} photos={visiblePhotos} onStart={() => setStep("start")} onPreview={(photo) => openPreview(photo, visiblePhotos)} />
            </>
          )}

          {step === "summary" && (
            <SummaryView activeProject={activeProject} selections={selections}
              onModify={(s: "start" | "premium" | "enlargement") => goToStep(s)}
              onConfirm={handleConfirm} isSubmitting={isSubmitting}
              isBlocked={confirmBlocked} blockerMessage={confirmBlockerMessage}
              onDismissBlocker={() => { setConfirmBlocked(false); setConfirmBlockerMessage(""); }} />
          )}

          {step === "confirmed" && (
            <ConfirmedView project={confirmedProject ?? activeProject} isAdmin={isAdmin}
              onRestart={() => { setStep("gallery"); setActiveProject(null); setSelections(emptySelection); }} />
          )}

          {step !== "free" && step !== "summary" && step !== "confirmed" && (
            <>
              {step === "premium" && (
                <SourceSelector source={premiumSource} onChange={setPremiumSource} label="Choisir les premiums parmi :" options={[
                  { value: "all", label: "Toutes les photos", desc: "Parcourir l'integralite du reportage" },
                  { value: "start", label: "Ma selection Start", desc: `Seulement les ${selections.start.length} photos deja selectionnees` }
                ]} />
              )}
              {step === "enlargement" && (
                <SourceSelector source={enlargementSource} onChange={setEnlargementSource} label="Choisir les agrandissements parmi :" options={[
                  { value: "all", label: "Toutes les photos", desc: "Parcourir l'integralite du reportage" },
                  { value: "start", label: "Ma selection Start", desc: `Seulement les ${selections.start.length} photos deja selectionnees` }
                ]} />
              )}
              <div className="sticky top-0 z-20 -mx-3 bg-studio/95 px-3 py-3 backdrop-blur lg:hidden">
                <FolderTree folders={allFolders} photos={activeProject.photos} activeFolderId={activeFolderId} selectedIds={selections.start} onSelect={setActiveFolderId} />
              </div>
              <SelectionHeader currentType={currentType} quota={quota}
                selectedCount={selections[currentType].length}
                visibleCount={visiblePhotos.length} />

              {flowMessage ? (
                <p className="mb-3 rounded-lg bg-gold/20 px-4 py-3 text-sm font-black text-ink">{flowMessage}</p>
              ) : null}

              {quotaWarning ? (
                <div className="mb-3 rounded-lg border border-clay/30 bg-clay/10 p-3">
                  <p className="text-sm font-bold text-clay">{quotaWarning}</p>
                  <button className="mt-1 text-xs font-bold text-clay underline underline-offset-2" onClick={() => setShowQuotaHelp(!showQuotaHelp)}>
                    En savoir plus
                  </button>
                  {showQuotaHelp && (
                    <p className="mt-1 text-xs leading-5 text-clay/75">
                      Les images ajoutees au-dela du quota seront facturees comme photos supplementaires.
                      Tu peux continuer ta selection ou la modifier en dessous du quota.
                    </p>
                  )}
                </div>
              ) : null}

              <PhotoGridWithPreview photos={visiblePhotos} selections={selections} currentType={currentType}
                toggleSelect={toggleSelect} onPreview={(photo) => openPreview(photo, visiblePhotos)} />
            </>
          )}
        </section>
      </div>

      {step !== "summary" && step !== "confirmed" && (
        <BottomCounter activeProject={activeProject} extraPrice={extraPrice}
          goNext={goNext} goPrev={goPrev}
          selections={selections} startExtra={startExtra} step={step}
          canGoNext={canGoNext} canGoPrev={canGoPrev} />
      )}

      {viewerOpen && (
        <ImageViewer photos={viewerPhotos} startIndex={viewerIndex}
          onClose={() => { setViewerOpen(false); setViewerPhotos([]); }}
          onToggleSelect={toggleSelect}
          selectedIds={selections[currentType]}
          type={stepConfig[currentType]?.short || currentType} />
      )}
    </main>
  );
}

// --- Sub-components ---

function Header({ compact, isAdmin }: { compact?: boolean; isAdmin?: boolean }) {
  return (
    <header className={clsx("flex items-center justify-between gap-3", compact && "rounded-lg bg-ink p-3 text-white shadow-lift")}>
      <div className="flex items-center gap-3">
        <img alt="Samy Production 237" className="h-11 w-11 rounded-md bg-white object-contain p-1" src="/images/LogoSamyProduction.png" />
        <div>
          <p className={clsx("text-sm font-black leading-tight", compact ? "text-white" : "text-ink")}>SAMY PRODUCTION 237</p>
          <p className={clsx("text-xs", compact ? "text-white/65" : "text-ink/60")}>Yaounde, Cameroun</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && compact && <span className="rounded-full bg-gold px-2 py-1 text-[10px] font-black text-ink">STUDIO</span>}
        <ShieldCheck className={compact ? "text-gold" : "text-leaf"} size={24} />
      </div>
    </header>
  );
}

function TopBar({ activeProject, step, selections, quotas, onGoToStep, onGoBack }: {
  activeProject: Project; step: Step;
  selections: SelectionState; quotas: Project["quotas"];
  onGoToStep: (s: "start" | "premium" | "enlargement") => void;
  onGoBack: () => void;
}) {
  return (
    <div className="mb-4 rounded-lg bg-white p-3 shadow-lift ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/5" onClick={onGoBack} aria-label="Retour">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{activeProject.coupleName}</p>
          <p className="truncate text-xs text-ink/55">{activeProject.venue}</p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf text-white"><Images size={20} /></div>
      </div>
    </div>
  );
}

function FreeView({ project, photos, onStart, onPreview }: {
  project: Project; photos: Photo[];
  onStart: () => void; onPreview: (photo: Photo) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg bg-white p-4 shadow-lift ring-1 ring-black/5">
        <p className="text-xs font-bold uppercase tracking-widest text-leaf">Lecture libre</p>
        <h1 className="mt-1 text-3xl font-black">Parcours les photos avant de choisir</h1>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Les images sont filigranees et protegees. Quand tu es pret, demarre la selection guidee.
        </p>
        <button className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-4 font-black text-white" onClick={onStart}>
          <Sparkles size={19} /> Demarrer ma selection
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <button key={photo.id} className="photo-protection relative aspect-[3/4] overflow-hidden rounded-lg bg-ink/10" onClick={() => onPreview(photo)}>
            <img alt={photo.filename} className="h-full w-full object-cover" src={photo.watermarkedUrl} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SourceSelector({ source, onChange, label, options }: {
  source: string; onChange: (v: any) => void; label: string;
  options: { value: string; label: string; desc: string }[];
}) {
  return (
    <div className="mb-4 rounded-lg bg-white p-4 shadow-lift ring-1 ring-black/5">
      <p className="text-xs font-bold uppercase tracking-widest text-clay">{label}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <button key={opt.value} className={clsx("rounded-lg border-2 p-3 text-left transition", source === opt.value ? "border-leaf bg-leaf/10" : "border-transparent bg-studio")} onClick={() => onChange(opt.value)}>
            <p className="text-sm font-black">{opt.label}</p>
            <p className="mt-1 text-xs text-ink/60">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectionHeader({ currentType, quota, selectedCount, visibleCount }: {
  currentType: string; quota: number; selectedCount: number; visibleCount: number;
}) {
  const cfg = stepConfig[currentType] || stepConfig.start;
  return (
    <div className={clsx("mb-3 rounded-lg p-4 shadow-lift ring-1",
      currentType === "start" && "ring-leaf/30 bg-white",
      currentType === "premium" && "ring-gold/30 bg-white",
      currentType === "enlargement" && "ring-clay/30 bg-white"
    )}>
      <h1 className="text-2xl font-black sm:text-3xl">{cfg.title}</h1>
      <p className="mt-1 text-sm leading-6 text-ink/65">{cfg.hint}</p>
      <div className="mt-3 flex items-center justify-between rounded-md bg-studio p-3 text-sm font-bold">
        <span>{visibleCount} photos visibles</span>
        <span>{selectedCount}/{quota}</span>
      </div>
    </div>
  );
}

function PhotoGridWithPreview({ photos, selections, currentType, toggleSelect, onPreview }: {
  photos: Photo[]; selections: SelectionState; currentType: string;
  toggleSelect: (photo: Photo) => void; onPreview: (photo: Photo) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {photos.map((photo) => {
        const selected = (selections as any)[currentType]?.includes(photo.id) || false;
        const isPremium = selections.premium.includes(photo.id);
        const isEnlargement = selections.enlargement.includes(photo.id);
        return (
          <div key={photo.id} className={clsx("group relative overflow-hidden rounded-lg bg-ink/10 ring-2 transition", selected ? "ring-leaf" : "ring-transparent")}>
            <button className="block w-full" onClick={() => onPreview(photo)}>
              <div className="photo-protection relative aspect-[3/4] overflow-hidden">
                <img alt={photo.filename} className="h-full w-full object-cover" src={photo.watermarkedUrl} />
              </div>
            </button>
            <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[11px] font-bold text-white">{photo.filename}</span>
            <button
              className={clsx("absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full text-white shadow-lg transition", selected ? "bg-leaf" : "bg-black/45 hover:bg-ink/70")}
              onClick={() => toggleSelect(photo)}
            >
              {selected ? <Check size={20} /> : <Square size={16} />}
            </button>
            <div className="absolute bottom-2 left-2 flex gap-1">
              {isPremium ? <span className="rounded-full bg-gold px-2 py-1 text-[11px] font-black text-ink">Premium</span> : null}
              {isEnlargement ? <span className="rounded-full bg-clay px-2 py-1 text-[11px] font-black text-white">Grand</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BottomCounter(props: {
  activeProject: Project; extraPrice: number;
  goNext: () => void; goPrev: () => void;
  selections: SelectionState; startExtra: number; step: Step;
  canGoNext: boolean; canGoPrev: boolean;
}) {
  const stepLabel = props.step === "free" ? "Demarrer"
    : props.step === "enlargement" ? "Recap"
    : "Suite";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/96 px-3 py-3 shadow-[0_-12px_35px_rgba(23,20,18,0.12)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-2">
          <CounterCell label="Start" value={`${props.selections.start.length}/${props.activeProject.quotas.start}`} active={props.step === "start"} />
          <CounterCell label="Premium" value={`${props.selections.premium.length}/${props.activeProject.quotas.premium}`} active={props.step === "premium"} />
          <CounterCell label="Agrand." value={`${props.selections.enlargement.length}/${props.activeProject.quotas.enlargement}`} active={props.step === "enlargement"} />
          <CounterCell label="Suppl." value={`${props.startExtra}`} active={props.startExtra > 0} />
        </div>
        <div className="flex gap-2">
          {props.canGoPrev && (
            <button className="flex h-14 min-w-20 items-center justify-center rounded-lg bg-studio px-4 text-sm font-black text-ink ring-1 ring-black/10"
              onClick={props.goPrev}>
              <ChevronLeft size={20} /> Precedent
            </button>
          )}
          {props.canGoNext && (
            <button className="flex h-14 min-w-28 items-center justify-center rounded-lg bg-ink px-4 text-sm font-black text-white sm:min-w-44"
              onClick={props.goNext}>
              {stepLabel} <ChevronRight size={20} />
            </button>
          )}
          {props.step === "free" && (
            <button className="flex h-14 min-w-28 items-center justify-center rounded-lg bg-ink px-4 text-sm font-black text-white sm:min-w-44"
              onClick={props.goNext}>
              {stepLabel} <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
      {props.startExtra > 0 ? <p className="mx-auto mt-2 max-w-7xl text-xs font-bold text-clay">Supplement : {props.startExtra} photo(s), {props.extraPrice.toLocaleString("fr-FR")} FCFA</p> : null}
    </div>
  );
}

function CounterCell({ active, label, value }: { active: boolean; label: string; value: string }) {
  return (
    <div className={clsx("rounded-lg p-2 text-center ring-1", active ? "bg-leaf text-white ring-leaf" : "bg-studio text-ink ring-black/5")}>
      <p className="text-[11px] font-bold uppercase">{label}</p>
      <p className="text-base font-black">{value}</p>
    </div>
  );
}

function SummaryView({ activeProject, selections, onModify, onConfirm, isSubmitting, isBlocked, blockerMessage, onDismissBlocker }: {
  activeProject: Project; selections: SelectionState;
  onModify: (s: "start" | "premium" | "enlargement") => void;
  onConfirm: () => void; isSubmitting: boolean;
  isBlocked?: boolean; blockerMessage?: string; onDismissBlocker?: () => void;
}) {
  const photoById = new Map(activeProject.photos.map((p) => [p.id, p]));
  const totalStart = selections.start.length;
  const totalPremium = selections.premium.length;
  const totalEnlargement = selections.enlargement.length;
  const extra = Math.max(0, totalStart - activeProject.quotas.start);
  const price = calculateExtraPrice(extra, activeProject);
  const q = activeProject.quotas;

  type SectionType = "start" | "premium" | "enlargement";
  const sections: { type: SectionType; label: string; title: string; selectedIds: string[]; quota: number }[] = [
    { type: "start", label: "Start", title: "Photos Start", selectedIds: selections.start, quota: q.start },
    { type: "premium", label: "Premium", title: "Photos Premium", selectedIds: selections.premium, quota: q.premium },
    { type: "enlargement", label: "Agrand.", title: "Agrandissements", selectedIds: selections.enlargement, quota: q.enlargement },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-lg bg-white p-4 shadow-lift ring-1 ring-black/5">
        <p className="text-xs font-bold uppercase tracking-widest text-leaf">Recapitulatif</p>
        <h1 className="mt-1 text-3xl font-black">Verifie avant confirmation</h1>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-3">
          <SummaryMetric label="Start" value={`${totalStart}/${q.start}`} />
          <SummaryMetric label="Premium" value={`${totalPremium}/${q.premium}`} />
          <SummaryMetric label="Agrand." value={`${totalEnlargement}/${q.enlargement}`} />
        </div>
        {extra > 0 && (
          <div className="mt-2 rounded-lg bg-clay/10 p-3 text-sm font-bold text-clay">
            {extra} photo(s) supplementaire(s) : {price.toLocaleString("fr-FR")} FCFA
          </div>
        )}
        {isBlocked && blockerMessage && (
          <div className="mt-3 rounded-lg border border-clay/40 bg-clay/10 p-4">
            <p className="text-sm font-black text-clay">{blockerMessage}</p>
            <button className="mt-3 rounded-lg bg-clay px-4 py-2 text-sm font-black text-white" onClick={onDismissBlocker}>
              Modifier ma selection
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3">
        {sections.map((sec) => {
          const photosInSection = sec.selectedIds.map((id) => photoById.get(id)).filter((p): p is Photo => !!p);
          const byFolder = activeProject.folders.map((f) => ({
            folder: f,
            count: photosInSection.filter((p) => p.folderId === f.id).length
          })).filter((f) => f.count > 0);

          return (
            <div key={sec.type} className={clsx("rounded-lg bg-white p-4 shadow-lift ring-1",
              sec.type === "start" && "ring-leaf/20",
              sec.type === "premium" && "ring-gold/20",
              sec.type === "enlargement" && "ring-clay/20"
            )}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-ink/55">{sec.title}</p>
                  <p className="text-lg font-black">{photosInSection.length} / {sec.quota}</p>
                </div>
                <button className="rounded-lg bg-studio px-4 py-2 text-sm font-bold text-ink ring-1 ring-black/10" onClick={() => onModify(sec.type)}>
                  Modifier
                </button>
              </div>
              {byFolder.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {byFolder.map((f) => (
                    <span key={f.folder.id} className="rounded-full bg-studio px-2.5 py-1 text-xs font-bold text-ink/60">
                      {f.folder.name}: {f.count}
                    </span>
                  ))}
                </div>
              )}
              {photosInSection.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {photosInSection.slice(0, 12).map((photo) => (
                    <div key={photo.id} className="photo-protection relative aspect-square overflow-hidden rounded-md bg-ink/10">
                      <img alt={photo.filename} className="h-full w-full object-cover" src={photo.watermarkedUrl} />
                    </div>
                  ))}
                </div>
              )}
              {photosInSection.length > 12 && (
                <p className="mt-2 text-xs font-bold text-ink/50">+ {photosInSection.length - 12} autre(s)</p>
              )}
            </div>
          );
        })}

        {!isBlocked && (
          <div className="flex gap-3">
            <button className="flex-1 rounded-lg bg-studio px-4 py-4 font-black text-ink ring-1 ring-black/10"
              onClick={() => onModify("start")}>Modifier ma selection</button>
            <button className="flex-1 rounded-lg bg-ink px-4 py-4 font-black text-white disabled:opacity-60"
              disabled={isSubmitting} onClick={onConfirm}>
              <Send size={18} className="inline mr-2" />
              {isSubmitting ? "Envoi..." : "Continuer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-studio p-3 text-center">
      <p className="text-[11px] font-bold uppercase text-ink/55">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

function ConfirmedView({ project, isAdmin, onRestart }: { project: Project; isAdmin?: boolean; onRestart: () => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg bg-white p-6 shadow-lift ring-1 ring-black/5">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-leaf">
          <Check size={32} className="text-white" />
        </div>
        <p className="text-center text-xs font-bold uppercase tracking-widest text-leaf">Selection verrouillee</p>
        <h1 className="mt-2 text-center text-3xl font-black">Felicitations !</h1>
        <p className="mt-3 text-center text-sm leading-6 text-ink/65">
          Ta selection a ete envoyee au studio. Tu recevras bientot une confirmation par WhatsApp.
        </p>
        <div className="mt-6 grid gap-3">
          <button className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-4 font-black text-white"
            onClick={onRestart}>
            <ChevronLeft size={20} /> Retour a l&apos;accueil
          </button>
          {isAdmin && (
            <a className="flex h-14 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-4 font-black text-ink"
              href="/admin">
              Voir dans le tableau de bord
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
