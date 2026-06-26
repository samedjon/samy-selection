"use client";

import { Archive, Cloud, FolderOpen, FolderUp, ImageIcon, Loader2, LogOut, MessageCircle, Pencil, RotateCcw, Terminal, Trash2, UploadCloud, User, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { Project } from "@/types/selection";
import { deleteLocalProject, importFolderProject, loadLocalProjects } from "@/lib/local-project-store";
import type { SavedSelection } from "@/lib/selections-store";

type BrowserFile = File & { webkitRelativePath?: string };
type BrowserEntry = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  fullPath: string;
};
type BrowserFileEntry = BrowserEntry & {
  file: (success: (file: File) => void, failure: (error: DOMException) => void) => void;
};
type BrowserDirectoryEntry = BrowserEntry & {
  createReader: () => {
    readEntries: (success: (entries: BrowserEntry[]) => void, failure: (error: DOMException) => void) => void;
  };
};
type BrowserDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => BrowserEntry | null;
};
type DriveImportItem = {
  id: string;
  name: string;
  relativePath: string;
};
type DriveCloudinaryPhoto = {
  originalRelativePath: string;
  watermarkedUrl: string;
  cloudinaryPublicId: string;
};
type DriveImportSession = {
  cloudinaryPhotos: DriveCloudinaryPhoto[];
  driveUrl: string;
  items: DriveImportItem[];
  projectName: string;
  status: "running" | "paused" | "completed";
  updatedAt: string;
};

const today = new Date().toISOString().slice(0, 10);
const eventTypes = ["Mariage", "Anniversaire", "Bapteme", "Communion", "Deuil", "Ceremonie", "Autre"];
const cities = ["Yaounde", "Douala", "Yaounde et Douala", "Autre"];
const defaultWhatsapp = "+237 6 97 29 15 46";
const defaultEmail = "SAMIProductions237@gmail.com";
const driveBatchSize = 8;
const driveBatchMaxRetries = 3;
const driveImportStoragePrefix = "samy_drive_import_";

export default function StudioAdmin({ user }: { user: { email: string; name: string } | null }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState("");
  const [eventType, setEventType] = useState("Mariage");
  const [customEventType, setCustomEventType] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [venue, setVenue] = useState("Yaounde");
  const [customVenue, setCustomVenue] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [notificationEmail, setNotificationEmail] = useState(defaultEmail);
  const [notificationWhatsapp, setNotificationWhatsapp] = useState(defaultWhatsapp);
  const [driveUrl, setDriveUrl] = useState("");
  const [quotaStart, setQuotaStart] = useState(90);
  const [quotaPremium, setQuotaPremium] = useState(10);
  const [quotaEnlargement, setQuotaEnlargement] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isServerImporting, setIsServerImporting] = useState(false);
  const [isDriveImporting, setIsDriveImporting] = useState(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState<{ projectId: string; progress: number } | null>(null);
  const [driveResumeSession, setDriveResumeSession] = useState<DriveImportSession | null>(null);
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [serverProjects, setServerProjects] = useState<Project[]>([]);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCover, setEditCover] = useState("");
  const [savedSelections, setSavedSelections] = useState<SavedSelection[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    void refreshProjects();
    void refreshServerProjects();
    void refreshSelections();
  }, []);

  useEffect(() => {
    setDriveResumeSession(loadDriveImportSession(driveUrl));
  }, [driveUrl]);

  useEffect(() => {
    if (!isDriveImporting || !driveUrl) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/drive-import?projectId=${encodeURIComponent(driveUrl)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.progress !== undefined) {
            setDriveUploadProgress({ projectId: data.state?.projectId || "unknown", progress: data.progress });
            if (data.completed) {
              clearInterval(interval);
              setIsDriveImporting(false);
            }
          }
        }
      } catch { }
    }, 5000);
    return () => clearInterval(interval);
  }, [isDriveImporting, driveUrl]);

  const imageFiles = useMemo(() => files.filter(isImageFile), [files]);
  const folderPreview = useMemo(() => {
    const folders = new Map<string, number>();
    for (const file of imageFiles) {
      const relativePath = getRelativePath(file);
      const parts = relativePath.split("/").filter(Boolean);
      const folderName = parts.length <= 2 ? "Photos" : parts.slice(1, -1).join(" / ");
      folders.set(folderName, (folders.get(folderName) ?? 0) + 1);
    }
    return Array.from(folders.entries()).sort(([a], [b]) => sortStudioFolders(a, b));
  }, [imageFiles]);

  const rootName = useMemo(() => {
    const first = imageFiles[0] ? getRelativePath(imageFiles[0]).split("/").filter(Boolean)[0] : "";
    return first && first !== imageFiles[0]?.name ? first : "";
  }, [imageFiles]);

  async function refreshProjects() {
    setProjects(await loadLocalProjects());
  }

  async function refreshServerProjects() {
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      let payload: any = { ok: false, projects: [] };
      try { payload = await response.json(); } catch { /* ignore */ }
      if (payload.ok) setServerProjects(payload.projects ?? []);
    } catch {
      setServerProjects([]);
    }
  }

  async function refreshSelections() {
    try {
      const response = await fetch("/api/admin/selections", { cache: "no-store" });
      let payload: any = { ok: false, selections: [] };
      try { payload = await response.json(); } catch { /* ignore */ }
      if (payload.ok) setSavedSelections(payload.selections ?? []);
    } catch {
      setSavedSelections([]);
    }
  }

  async function refreshLogs() {
    try {
      const response = await fetch("/api/admin/logs?count=100", { cache: "no-store" });
      let payload: any = { ok: false, logs: [] };
      try { payload = await response.json(); } catch { /* ignore */ }
      if (payload.ok) setLogs(payload.logs ?? []);
    } catch {
      setLogs([]);
    }
  }

  function clearFiles() {
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function validateBeforeImport() {
    if (!projectName.trim()) {
      setMessage("Renseigne le nom du projet avant de continuer.");
      return false;
    }
    if (imageFiles.length === 0) {
      setMessage("Choisis ou depose un dossier contenant des images.");
      return false;
    }
    if (!/^\d{4}$/.test(accessCode)) {
      setMessage("Le code client doit contenir exactement 4 chiffres.");
      return false;
    }
    if (eventType === "Autre" && !customEventType.trim()) {
      setMessage("Precise le type d'evenement.");
      return false;
    }
    if (venue === "Autre" && !customVenue.trim()) {
      setMessage("Precise la ville ou le lieu.");
      return false;
    }
    return true;
  }

  const resolvedEventType = eventType === "Autre" ? customEventType.trim() : eventType;
  const resolvedVenue = venue === "Autre" ? customVenue.trim() : venue;

  async function handleImport() {
    setMessage("");
    if (!validateBeforeImport()) return;

    setIsImporting(true);
    try {
      const project = await importFolderProject({
        accessCode,
        eventDate,
        eventType: resolvedEventType || "Evenement",
        files: imageFiles,
        notificationEmail,
        notificationWhatsapp,
        projectName,
        quotas: {
          start: quotaStart,
          premium: quotaPremium,
          enlargement: quotaEnlargement
        },
        venue: resolvedVenue
      });
      setMessage(`Projet local "${project.coupleName}" importe : ${project.folders.length} dossier(s), ${project.photos.length} image(s).`);
      clearFiles();
      await refreshProjects();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleServerImport() {
    setMessage("");
    if (!validateBeforeImport()) return;

    setIsServerImporting(true);
    try {
      const formData = new FormData();
      formData.append("projectName", projectName);
      formData.append("eventType", resolvedEventType || "Evenement");
      formData.append("eventDate", eventDate);
      formData.append("venue", resolvedVenue);
      formData.append("accessCode", accessCode);
      formData.append("notificationEmail", notificationEmail);
      formData.append("notificationWhatsapp", notificationWhatsapp);
      formData.append("driveUrl", driveUrl);
      formData.append("quotaStart", String(quotaStart));
      formData.append("quotaPremium", String(quotaPremium));
      formData.append("quotaEnlargement", String(quotaEnlargement));

      for (const file of imageFiles) {
        formData.append("files", file, file.name);
        formData.append("relativePaths", getRelativePath(file));
      }

      const response = await fetch("/api/admin/import", {
        method: "POST",
        body: formData
      });
      let payload: any = { ok: false, message: "Reponse serveur vide." };
      try {
        payload = await response.json();
      } catch {
        const text = await response.text().catch(() => "");
        setMessage(text ? `Reponse inattendue: ${text.slice(0, 200)}` : `Erreur serveur (${response.status}).`);
        return;
      }
      if (!response.ok || !payload.ok || !payload.project) {
        setMessage(payload.message ?? "Import serveur impossible.");
        return;
      }

      setMessage(`Projet serveur "${payload.project.coupleName}" pret : ${payload.project.folders.length} dossier(s), ${payload.project.photos.length} image(s). Ouvre le portail client.`);
      clearFiles();
      await refreshServerProjects();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import serveur impossible.");
    } finally {
      setIsServerImporting(false);
    }
  }

  async function handleDriveImport() {
    await runDriveImport(false);
  }

  async function handleResumeDriveImport() {
    await runDriveImport(true);
  }

  async function runDriveImport(shouldResume: boolean) {
    setMessage("");
    if (!driveUrl) {
      setMessage("Renseigne le lien Google Drive avant de continuer.");
      return;
    }

    setIsDriveImporting(true);
    
    try {
      if (!shouldResume) {
        setDriveUploadProgress({ projectId: "Google Drive", progress: 5 });
        setMessage("Analyse du dossier Drive et création de la galerie directe...");
        const response = await fetch(`/api/admin/drive-public-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driveUrl,
            mode: "create-drive-project",
            projectName: projectName.trim() || undefined,
            eventType: resolvedEventType || "Evenement",
            eventDate,
            venue: resolvedVenue,
            accessCode: /^\d{4}$/.test(accessCode) ? accessCode : "0000",
            notificationEmail,
            notificationWhatsapp,
            quotas: {
              start: quotaStart,
              premium: quotaPremium,
              enlargement: quotaEnlargement
            }
          }),
        });
        const payload = await response.json().catch(() => ({ ok: false, message: "Réponse serveur vide." }));
        if (!response.ok || !payload.ok) {
          setMessage(payload.message ?? "Création Drive directe impossible.");
          return;
        }

        clearDriveImportSession(driveUrl);
        setDriveResumeSession(null);
        setDriveUploadProgress({ projectId: payload.project?.coupleName || "Google Drive", progress: 100 });
        setMessage(`Galerie Drive "${payload.project?.coupleName || "Projet Drive"}" créée : ${payload.files} image(s). Ouvre le portail client.`);
        await refreshServerProjects();
        return;
      }

      let session = shouldResume ? loadDriveImportSession(driveUrl) : null;
      if (!session) {
        setDriveUploadProgress(null);
        setMessage("Analyse du dossier Google Drive...");
        const scanResponse = await fetch(`/api/admin/drive-public-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveUrl, mode: "scan" }),
        });
        let scanPayload: any = { ok: false, message: "Réponse serveur vide." };
        try {
          scanPayload = await scanResponse.json();
        } catch {
          const text = await scanResponse.text().catch(() => "");
          setMessage(text ? `Réponse inattendue: ${text.slice(0, 200)}` : `Erreur serveur (${scanResponse.status}).`);
          return;
        }
        if (!scanResponse.ok || !scanPayload.ok) {
          setMessage(scanPayload.message ?? "Analyse Drive impossible.");
          return;
        }

        const items = (scanPayload.items ?? []) as DriveImportItem[];
        if (items.length === 0) {
          setMessage("Aucune image trouvée dans ce dossier Drive.");
          return;
        }

        session = {
          cloudinaryPhotos: [],
          driveUrl,
          items,
          projectName: String(scanPayload.projectName || "Projet Drive"),
          status: "running",
          updatedAt: new Date().toISOString()
        };
      }

      session.status = "running";
      session.updatedAt = new Date().toISOString();
      saveDriveImportSession(session);
      setDriveResumeSession(session);

      const uploadedPaths = new Set(session.cloudinaryPhotos.map((photo) => photo.originalRelativePath));
      updateDriveProgress(session, uploadedPaths.size);
      setMessage(`Import Drive en cours : ${uploadedPaths.size}/${session.items.length} image(s). Garde cette page ouverte.`);

      while (uploadedPaths.size < session.items.length) {
        const pendingBatch = session.items
          .filter((item) => !uploadedPaths.has(item.relativePath))
          .slice(0, driveBatchSize);
        const batchNumber = Math.floor(uploadedPaths.size / driveBatchSize) + 1;
        const result = await uploadDriveBatchWithRetry(session, pendingBatch, batchNumber);

        if (result.cloudinaryPhotos.length === 0 && result.failedItems.length > 0) {
          session.status = "paused";
          session.updatedAt = new Date().toISOString();
          saveDriveImportSession(session);
          setDriveResumeSession(session);
          setMessage(`Import suspendu au lot ${batchNumber}. ${uploadedPaths.size}/${session.items.length} image(s) déjà sauvegardée(s). Clique sur Reprendre pour continuer.`);
          return;
        }

        for (const photo of result.cloudinaryPhotos) {
          if (!uploadedPaths.has(photo.originalRelativePath)) {
            uploadedPaths.add(photo.originalRelativePath);
            session.cloudinaryPhotos.push(photo);
          }
        }

        session.updatedAt = new Date().toISOString();
        saveDriveImportSession(session);
        setDriveResumeSession({ ...session });
        updateDriveProgress(session, uploadedPaths.size);
        setMessage(`Import Drive en cours : ${uploadedPaths.size}/${session.items.length} image(s).`);
      }

      if (session.cloudinaryPhotos.length === 0) {
        setMessage("Aucune image n'a pu être envoyée vers Cloudinary.");
        return;
      }

      setMessage("Création de la galerie client...");
      const createResponse = await fetch(`/api/admin/drive-public-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveUrl,
          mode: "create-project",
          projectName: projectName.trim() || session.projectName,
          eventType: resolvedEventType || "Evenement",
          eventDate,
          venue: resolvedVenue,
          accessCode: /^\d{4}$/.test(accessCode) ? accessCode : "0000",
          notificationEmail,
          notificationWhatsapp,
          quotas: {
            start: quotaStart,
            premium: quotaPremium,
            enlargement: quotaEnlargement
          },
          cloudinaryPhotos: session.cloudinaryPhotos
        }),
      });
      const createPayload = await createResponse.json().catch(() => ({ ok: false, message: "Réponse serveur vide." }));
      if (!createResponse.ok || !createPayload.ok) {
        setMessage(createPayload.message ?? "Création du projet Drive impossible.");
        return;
      }

      clearDriveImportSession(driveUrl);
      setDriveResumeSession(null);
      setMessage(`Projet Drive "${createPayload.project?.coupleName || session.projectName}" importé : ${session.cloudinaryPhotos.length} image(s). Ouvre le portail client.`);
      await refreshServerProjects();
    } catch (error) {
      const session = loadDriveImportSession(driveUrl);
      if (session) {
        session.status = "paused";
        session.updatedAt = new Date().toISOString();
        saveDriveImportSession(session);
        setDriveResumeSession(session);
      }
      setMessage(`${error instanceof Error ? error.message : "Import Drive impossible."} Tu peux cliquer sur Reprendre pour continuer.`);
    } finally {
      setIsDriveImporting(false);
    }
  }

  function updateDriveProgress(session: DriveImportSession, uploadedCount: number) {
    const progress = Math.round((uploadedCount / session.items.length) * 100);
    setDriveUploadProgress({ projectId: session.projectName, progress });
  }

  async function uploadDriveBatchWithRetry(session: DriveImportSession, batch: DriveImportItem[], batchNumber: number): Promise<{ cloudinaryPhotos: DriveCloudinaryPhoto[]; failedItems: DriveImportItem[] }> {
    let pending = batch;
    const uploaded: DriveCloudinaryPhoto[] = [];

    for (let attempt = 1; attempt <= driveBatchMaxRetries && pending.length > 0; attempt++) {
      setMessage(`Lot ${batchNumber} : tentative ${attempt}/${driveBatchMaxRetries} (${pending.length} image(s)).`);
      const response = await fetch(`/api/admin/drive-public-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveUrl: session.driveUrl,
          mode: "upload-batch",
          projectName: session.projectName,
          batchPrefix: session.projectName,
          items: pending
        }),
      });
      const payload = await response.json().catch(() => ({ ok: false, message: "Réponse serveur vide.", failedItems: pending }));
      const uploadedPhotos = (payload.cloudinaryPhotos ?? []) as DriveCloudinaryPhoto[];
      uploaded.push(...uploadedPhotos);
      const uploadedPaths = new Set(uploadedPhotos.map((photo) => photo.originalRelativePath));
      const failedItems = Array.isArray(payload.failedItems)
        ? (payload.failedItems as DriveImportItem[])
        : pending.filter((item) => !uploadedPaths.has(item.relativePath));

      if (response.ok && uploadedPhotos.length === pending.length) {
        pending = [];
        break;
      }

      pending = failedItems.length ? failedItems : pending.filter((item) => !uploadedPaths.has(item.relativePath));
      if (pending.length > 0 && attempt < driveBatchMaxRetries) {
        await wait(1200 * attempt);
      }
    }

    return { cloudinaryPhotos: uploaded, failedItems: pending };
  }

  async function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    setMessage("");

    const dropped = await readDroppedFiles(event.dataTransfer);
    if (dropped.length) {
      setFiles(dropped);
      return;
    }

    setFiles(Array.from(event.dataTransfer.files));
  }

  async function removeProject(projectId: string) {
    await deleteLocalProject(projectId);
    await refreshProjects();
  }

  function startEdit(project: Project) {
    setEditingProjectId(project.id);
    setEditName(project.coupleName);
    setEditCover(project.coverImageUrl);
  }

  async function updateServerProject(projectId: string, patch: Partial<Project>) {
    const response = await fetch("/api/admin/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...patch })
    });
    if (!response.ok) {
      setMessage("Modification impossible.");
      return;
    }
    setEditingProjectId("");
    await refreshServerProjects();
  }

  async function deleteServerProject(projectId: string) {
    const response = await fetch(`/api/admin/projects?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Suppression impossible.");
      return;
    }
    await refreshServerProjects();
  }

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <main className="min-h-screen bg-studio px-4 py-5 text-ink">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg bg-white p-4 shadow-lift ring-1 ring-black/5 sm:p-6">
          {user ? (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-ink/5 p-3">
              <div className="flex items-center gap-2">
                <User size={18} className="text-ink/60" />
                <span className="text-sm font-bold">{user.name}</span>
                <span className="text-xs text-ink/50">{user.email}</span>
              </div>
              <button className="flex items-center gap-1 rounded-full bg-clay px-3 py-2 text-xs font-black text-white" onClick={handleLogout}>
                <LogOut size={14} />
                Deconnexion
              </button>
            </div>
          ) : null}
          <p className="text-xs font-bold uppercase tracking-widest text-clay">Espace studio</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Creer une galerie client</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Importe le dossier racine du reportage. La structure interne du dossier devient la navigation client.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field hint="Ex : Mariage Serge & Alison" label="Nom du projet">
              <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none placeholder:text-ink/35" placeholder="Mariage Serge & Alison" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </Field>
            <Field hint="Mariage, anniversaire, bapteme..." label="Type d'evenement">
              <select className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none" value={eventType} onChange={(event) => setEventType(event.target.value)}>
                {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            {eventType === "Autre" ? (
              <Field hint="Ex : Conference, remise de diplome..." label="Nom de l'evenement">
                <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none placeholder:text-ink/35" placeholder="Preciser l'evenement" value={customEventType} onChange={(event) => setCustomEventType(event.target.value)} />
              </Field>
            ) : null}
            <Field label="Date">
              <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
            </Field>
            <Field hint="Ex : Yaounde" label="Lieu">
              <select className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none" value={venue} onChange={(event) => setVenue(event.target.value)}>
                {cities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </Field>
            {venue === "Autre" ? (
              <Field hint="Ex : Bafoussam, Kribi..." label="Ville">
                <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none placeholder:text-ink/35" placeholder="Preciser la ville" value={customVenue} onChange={(event) => setCustomVenue(event.target.value)} />
              </Field>
            ) : null}
            <Field hint="Ex : 2370" label="Code client 4 chiffres">
              <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 text-xl font-black tracking-[0.25em] outline-none placeholder:text-base placeholder:font-semibold placeholder:tracking-normal placeholder:text-ink/35" inputMode="numeric" maxLength={4} placeholder="2370" value={accessCode} onChange={(event) => setAccessCode(event.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field hint="Numero utilise pour pre-remplir le message final" label="WhatsApp studio">
              <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none placeholder:text-ink/35" placeholder="+237..." value={notificationWhatsapp} onChange={(event) => setNotificationWhatsapp(event.target.value)} />
            </Field>
            <Field hint="Adresse utilisee pour pre-remplir le mail final" label="Email studio">
              <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none placeholder:text-ink/35" placeholder="studio@email.com" type="email" value={notificationEmail} onChange={(event) => setNotificationEmail(event.target.value)} />
            </Field>
            <Field hint="Optionnel pour garder la trace du dossier source. L'import automatique Drive viendra avec l'API Google." label="Lien Google Drive">
              <input className="h-12 w-full rounded-lg border border-black/10 bg-studio px-3 outline-none placeholder:text-ink/35" placeholder="https://drive.google.com/..." value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} />
            </Field>
          </div>

          <div className="mt-5 grid gap-3 rounded-lg bg-studio p-3 sm:grid-cols-3">
            <NumberField label="Quota Start" value={quotaStart} setValue={setQuotaStart} />
            <NumberField label="Quota Premium" value={quotaPremium} setValue={setQuotaPremium} />
            <NumberField label="Agrandissements" value={quotaEnlargement} setValue={setQuotaEnlargement} />
          </div>

          <label
            className={`mt-5 grid cursor-pointer place-items-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${isDragging ? "border-leaf bg-leaf/10" : "border-ink/20 bg-studio hover:border-leaf"}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void handleDrop(event)}
          >
            <UploadCloud className="text-leaf" size={38} />
            <span className="mt-2 text-lg font-black">Deposer le dossier ici</span>
            <span className="mt-1 text-sm text-ink/55">ou cliquer pour choisir le dossier racine</span>
            <span className="mt-1 text-xs text-ink/45">Ex : Demo Mariage / DOTE, Mairie, Eglise, Soiree</span>
            <input
              ref={inputRef}
              className="sr-only"
              multiple
              type="file"
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>

          {folderPreview.length ? (
            <div className="mt-5 rounded-lg bg-white p-3 ring-1 ring-black/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-black">
                  <ImageIcon size={18} />
                  Analyse : {imageFiles.length} image(s)
                </div>
                <button className="flex items-center gap-1 rounded-full bg-studio px-3 py-2 text-xs font-black text-ink" onClick={clearFiles}>
                  <XCircle size={14} />
                  Vider
                </button>
              </div>
              {rootName ? <p className="mt-2 flex items-center gap-2 text-sm font-bold text-ink/60"><FolderOpen size={15} /> {rootName}</p> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {folderPreview.map(([folder, count]) => (
                  <div key={folder} className="flex items-center justify-between rounded-md bg-studio px-3 py-2 text-sm">
                    <span className="font-bold">{folder}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

           <div className="mt-5 grid gap-3 sm:grid-cols-3">
             <button className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-studio px-4 font-black text-ink ring-1 ring-black/10 disabled:opacity-60" disabled={isImporting || isServerImporting} onClick={handleImport}>
               {isImporting ? <Loader2 className="animate-spin" size={18} /> : <FolderUp size={18} />}
               {isImporting ? "Import..." : "Essai rapide"}
             </button>
             <button className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 font-black text-white disabled:opacity-60" disabled={isImporting || isServerImporting} onClick={handleServerImport}>
               {isServerImporting ? <Loader2 className="animate-spin" size={18} /> : <FolderUp size={18} />}
               {isServerImporting ? "Creation..." : "Creer la galerie client"}
             </button>
             <button className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 font-black text-white disabled:opacity-60" disabled={!driveUrl || isImporting || isServerImporting} onClick={handleDriveImport}>
               <Cloud size={18} />
               {isDriveImporting ? "Import..." : "Importer depuis Drive"}
             </button>
           </div>
           {driveResumeSession ? (
             <div className="mt-3 rounded-lg bg-gold/15 p-3 ring-1 ring-gold/30">
               <div className="flex flex-wrap items-center justify-between gap-3">
                 <div>
                   <p className="text-sm font-black text-ink">Import Drive récupérable</p>
                   <p className="mt-1 text-xs font-bold text-ink/60">
                     {driveResumeSession.cloudinaryPhotos.length}/{driveResumeSession.items.length} image(s) déjà envoyée(s) - {driveResumeSession.projectName}
                   </p>
                 </div>
                 <button className="rounded-lg bg-gold px-4 py-2 text-sm font-black text-ink disabled:opacity-60" disabled={isDriveImporting} onClick={handleResumeDriveImport}>
                   {isDriveImporting ? "Reprise..." : "Reprendre"}
                 </button>
               </div>
             </div>
           ) : null}
           {driveUploadProgress && (
             <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-black/10">
               <div className="h-3 overflow-hidden rounded-full bg-studio">
                 <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${driveUploadProgress.progress}%` }} />
               </div>
               <p className="mt-2 text-sm font-bold text-ink">Upload en cours : {driveUploadProgress.progress}%</p>
               <p className="text-xs text-ink/60">Projet : {driveUploadProgress.projectId}</p>
             </div>
           )}
          {message ? <p className="mt-3 rounded-lg bg-leaf/10 px-3 py-2 text-sm font-bold text-leaf">{message}</p> : null}
        </section>

        <aside className="rounded-lg bg-ink p-4 text-white shadow-lift">
          <h2 className="text-xl font-black">Galeries creees</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Les galeries publiees apparaissent sur le portail client. Tu peux modifier, archiver ou supprimer un test.</p>
          <a className="mt-4 block rounded-lg bg-gold px-4 py-3 text-center text-sm font-black text-ink" href="/">Ouvrir le portail client</a>

          <div className="mt-4 grid gap-3">
            {serverProjects.length === 0 ? <p className="rounded-lg bg-white/8 p-3 text-sm text-white/65">Aucune galerie serveur pour le moment.</p> : null}
            {serverProjects.map((project) => (
              <div key={project.id} className="rounded-lg bg-white/8 p-3">
                {editingProjectId === project.id ? (
                  <div className="grid gap-2">
                    <input className="h-10 rounded-md bg-white px-3 text-sm font-bold text-ink outline-none" value={editName} onChange={(event) => setEditName(event.target.value)} />
                    <select className="h-10 rounded-md bg-white px-3 text-sm font-bold text-ink outline-none" value={editCover} onChange={(event) => setEditCover(event.target.value)}>
                      {project.photos.map((photo) => <option key={photo.id} value={photo.watermarkedUrl}>{photo.filename}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="rounded-md bg-gold px-3 py-2 text-xs font-black text-ink" onClick={() => void updateServerProject(project.id, { coupleName: editName, coverImageUrl: editCover })}>Enregistrer</button>
                      <button className="rounded-md bg-white/10 px-3 py-2 text-xs font-black text-white" onClick={() => setEditingProjectId("")}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3">
                      <img alt={project.coupleName} className="h-14 w-14 rounded-md object-cover" src={project.coverImageUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black">{project.coupleName}</p>
                        <p className="mt-1 text-xs text-white/60">{project.isArchived ? "Archivee" : "Active"} - {project.folders.length} dossier(s), {project.photos.length} image(s)</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <button className="grid h-9 place-items-center rounded-md bg-white text-ink" aria-label="Modifier" onClick={() => startEdit(project)}><Pencil size={15} /></button>
                      <button className="grid h-9 place-items-center rounded-md bg-white/10 text-white" aria-label={project.isArchived ? "Restaurer" : "Archiver"} onClick={() => void updateServerProject(project.id, { isArchived: !project.isArchived })}>{project.isArchived ? <RotateCcw size={15} /> : <Archive size={15} />}</button>
                      <a className="grid h-9 place-items-center rounded-md bg-white/10 text-xs font-black text-white" href="/">Voir</a>
                      <button className="grid h-9 place-items-center rounded-md bg-clay text-white" aria-label="Supprimer" onClick={() => void deleteServerProject(project.id)}><Trash2 size={15} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {savedSelections.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-black uppercase tracking-widest text-white/50">Selections recues</h3>
              <div className="mt-4 grid gap-3">
                {savedSelections.map((sel) => (
                  <SelectionCard key={sel.id} sel={sel} />
                ))}
              </div>
            </>
          )}

          <button className="mt-6 flex w-full items-center justify-between rounded-lg bg-white/8 p-3 text-sm font-black text-white"
            onClick={() => { setShowLogs(!showLogs); if (!showLogs) void refreshLogs(); }}>
            <span className="flex items-center gap-2"><Terminal size={16} /> Journal systeme</span>
            <span>{showLogs ? "Masquer" : "Voir"}</span>
          </button>
          {showLogs && (
            <div className="mt-3 max-h-80 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5">
              {logs.length === 0 ? (
                <p className="text-white/40">Aucun log pour le moment.</p>
              ) : (
                logs.toReversed().map((entry, idx) => (
                  <div key={idx} className={clsx(
                    "border-b border-white/5 py-1",
                    entry.level === "error" && "text-clay",
                    entry.level === "warn" && "text-gold",
                    entry.level === "info" && "text-white/70",
                    entry.level === "debug" && "text-white/40"
                  )}>
                    <span className="text-white/40">[{new Date(entry.timestamp).toLocaleTimeString("fr-FR")}]</span>{" "}
                    <span className="font-bold">[{entry.category}]</span>{" "}
                    {entry.message}
                  </div>
                ))
              )}
            </div>
          )}

          <h3 className="mt-6 text-sm font-black uppercase tracking-widest text-white/50">Essais rapides</h3>
          <div className="mt-4 grid gap-3">
            {projects.length === 0 ? <p className="rounded-lg bg-white/8 p-3 text-sm text-white/65">Aucun essai rapide pour le moment.</p> : null}
            {projects.map((project) => (
              <div key={project.id} className="rounded-lg bg-white/8 p-3">
                <p className="font-black">{project.coupleName}</p>
                <p className="mt-1 text-xs text-white/60">{project.folders.length} dossier(s), {project.photos.length} image(s)</p>
                <div className="mt-3 flex gap-2">
                  <a className="flex-1 rounded-md bg-white px-3 py-2 text-center text-xs font-black text-ink" href="/">Tester</a>
                  <button className="grid h-9 w-9 place-items-center rounded-md bg-clay text-white" aria-label="Supprimer" onClick={() => void removeProject(project.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

import { ChevronDown, ChevronRight } from "lucide-react";

function SelectionCard({ sel }: { sel: SavedSelection }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg bg-white/8 p-3">
      <button className="flex w-full items-center justify-between gap-2" onClick={() => setExpanded(!expanded)}>
        <div className="min-w-0 flex-1 text-left">
          <p className="font-black text-sm">{sel.coupleName}</p>
          <p className="mt-0.5 text-xs text-white/50">
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(sel.timestamp))}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MessageCircle size={14} className="text-gold" />
          {expanded ? <ChevronDown size={14} className="text-white/50" /> : <ChevronRight size={14} className="text-white/50" />}
        </div>
      </button>
      <div className="mt-2 flex gap-1 flex-wrap">
        <span className="rounded-full bg-leaf/20 px-2 py-0.5 text-[10px] font-bold text-leaf">Start: {sel.selections.start.length}</span>
        <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold">Premium: {sel.selections.premium.length}</span>
        <span className="rounded-full bg-clay/20 px-2 py-0.5 text-[10px] font-bold text-clay">Agrand.: {sel.selections.enlargement.length}</span>
        {sel.extraCount > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white">+{sel.extraCount} supp.</span>}
      </div>
      {expanded && (
        <pre className="mt-3 max-h-60 overflow-auto rounded-md bg-black/40 p-3 text-[10px] leading-4 text-white/80 whitespace-pre-wrap font-mono">
          {sel.message}
        </pre>
      )}
    </div>
  );
}

function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-ink/70">
      {label}
      {children}
      {hint ? <span className="text-xs font-medium text-ink/45">{hint}</span> : null}
    </label>
  );
}

function NumberField({ label, setValue, value }: { label: string; setValue: (value: number) => void; value: number }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-ink/70">
      {label}
      <input className="h-12 w-full rounded-lg border border-black/10 bg-white px-3 outline-none" min={0} type="number" value={value} onChange={(event) => setValue(Number(event.target.value))} />
    </label>
  );
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name);
}

function getRelativePath(file: File): string {
  return (file as BrowserFile).webkitRelativePath || file.name;
}

function sortStudioFolders(a: string, b: string): number {
  const order = ["dote", "mairie", "eglise", "église", "soiree", "soirée"];
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const ia = order.indexOf(normalize(a));
  const ib = order.indexOf(normalize(b));
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return a.localeCompare(b);
}

async function readDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item as BrowserDataTransferItem).webkitGetAsEntry?.())
    .filter(Boolean) as BrowserEntry[];

  if (!entries.length) return [];

  const files: File[] = [];
  for (const entry of entries) {
    files.push(...(await readEntryFiles(entry, entry.name)));
  }
  return files;
}

async function readEntryFiles(entry: BrowserEntry, currentPath: string): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as BrowserFileEntry);
    return [withRelativePath(file, currentPath)];
  }

  if (!entry.isDirectory) return [];

  const directory = entry as BrowserDirectoryEntry;
  const children = await readAllDirectoryEntries(directory);
  const files: File[] = [];
  for (const child of children) {
    files.push(...(await readEntryFiles(child, `${currentPath}/${child.name}`)));
  }
  return files;
}

function readFileEntry(entry: BrowserFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readAllDirectoryEntries(entry: BrowserDirectoryEntry): Promise<BrowserEntry[]> {
  const reader = entry.createReader();
  const entries: BrowserEntry[] = [];

  return new Promise((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function withRelativePath(file: File, relativePath: string): File {
  try {
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: relativePath
    });
    return file;
  } catch {
    const clone = new File([file], file.name, { lastModified: file.lastModified, type: file.type });
    Object.defineProperty(clone, "webkitRelativePath", {
      configurable: true,
      value: relativePath
    });
    return clone;
  }
}

function driveImportStorageKey(driveUrl: string): string {
  return `${driveImportStoragePrefix}${btoa(unescape(encodeURIComponent(driveUrl.trim()))).replace(/[=+/]/g, "")}`;
}

function loadDriveImportSession(driveUrl: string): DriveImportSession | null {
  if (!driveUrl.trim() || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(driveImportStorageKey(driveUrl));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DriveImportSession;
    if (parsed.driveUrl !== driveUrl || parsed.status === "completed") return null;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.cloudinaryPhotos)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDriveImportSession(session: DriveImportSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(driveImportStorageKey(session.driveUrl), JSON.stringify(session));
}

function clearDriveImportSession(driveUrl: string) {
  if (!driveUrl.trim() || typeof window === "undefined") return;
  window.localStorage.removeItem(driveImportStorageKey(driveUrl));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
