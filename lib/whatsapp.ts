import type { Project, SelectionState } from "@/types/selection";
import { calculateExtraPrice } from "@/lib/demo-data";

export function buildStudioMessage(project: Project, selections: SelectionState): string {
  const photoById = new Map(project.photos.map((photo) => [photo.id, photo]));
  const folderById = new Map(project.folders.map((folder) => [folder.id, folder]));
  const startPhotos = selections.start.map((id) => photoById.get(id)).filter(Boolean);
  const grouped = new Map<string, string[]>();

  for (const photo of startPhotos) {
    if (!photo) continue;
    const folderName = folderById.get(photo.folderId)?.name ?? "Sans dossier";
    grouped.set(folderName, [...(grouped.get(folderName) ?? []), photo.filename]);
  }

  const premium = selections.premium.map((id) => photoById.get(id)?.filename).filter(Boolean);
  const enlargement = selections.enlargement.map((id) => photoById.get(id)?.filename).filter(Boolean);
  const extraCount = Math.max(0, selections.start.length - project.quotas.start);
  const extraPrice = calculateExtraPrice(extraCount, project);
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  const lines = [
    "SAMY PRODUCTION 237 - SELECTION RECUE",
    `Couple : ${project.coupleName}`,
    `Evenement : ${project.eventType ?? "Mariage"} ${new Intl.DateTimeFormat("fr-FR").format(new Date(project.eventDate))}`,
    `Selection faite le : ${date}`,
    ""
  ];

  for (const [folder, filenames] of grouped) {
    lines.push(`[${folder.toUpperCase()}] ${filenames.length} photos`);
    lines.push(filenames.join(", "));
    lines.push("");
  }

  lines.push(`[PREMIUM] ${premium.length} photos`);
  lines.push(premium.join(", ") || "Aucune");
  lines.push("");
  lines.push(`[AGRANDISSEMENTS] ${enlargement.length} photos`);
  lines.push(enlargement.join(", ") || "Aucun");
  lines.push("");
  lines.push(`[SUPPLEMENT] ${extraCount} photos - A FACTURER ${extraPrice.toLocaleString("fr-FR")} FCFA`);
  lines.push(`TOTAL : ${selections.start.length} photos confirmees`);

  return lines.join("\n");
}
