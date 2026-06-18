import type { Project } from "@/types/selection";

const imageBase = "/images/weddings/demo";

export const demoProject: Project = {
  id: "mariage-demo-237",
  coupleName: "M. & Mme Mballa",
  eventDate: "2026-06-14",
  venue: "Yaounde",
  coverImageUrl: `${imageBase}/Calque 7 copie.jpg`,
  // Demo password: 2370. In production, store only Supabase bcrypt hashes.
  passwordHash: "$2a$10$xaF/tvBG2gZxOy.omGCrSu64hb0OjGB./KvpK.WOXAuGRY6qQZdaO",
  quotas: {
    start: 6,
    premium: 2,
    enlargement: 1
  },
  source: "demo",
  priceGrid: [
    { min: 1, max: 50, unitPrice: 1000 },
    { min: 51, max: 200, unitPrice: 700 },
    { min: 201, max: 500, unitPrice: 500 },
    { min: 501, max: 1000, unitPrice: 300 },
    { min: 1001, max: null, unitPrice: 100 }
  ],
  folders: [
    { id: "preparatifs", name: "Preparatifs", displayOrder: 1 },
    { id: "mairie", name: "Mairie", displayOrder: 2 },
    { id: "eglise", name: "Eglise", displayOrder: 3 },
    { id: "soiree", name: "Soiree", displayOrder: 4 }
  ],
  photos: [
    { id: "p-001", filename: "Calque 7 copie.jpg", folderId: "preparatifs", watermarkedUrl: `${imageBase}/Calque 7 copie.jpg` },
    { id: "p-002", filename: "Fadila 2.jpg", folderId: "preparatifs", watermarkedUrl: `${imageBase}/Fadila 2.jpg` },
    { id: "p-003", filename: "Fadila 5.jpg", folderId: "preparatifs", watermarkedUrl: `${imageBase}/Fadila 5.jpg` },
    { id: "p-004", filename: "Meg 1.jpg", folderId: "mairie", watermarkedUrl: `${imageBase}/Meg 1.jpg` },
    { id: "p-005", filename: "Meg 2.jpg", folderId: "mairie", watermarkedUrl: `${imageBase}/Meg 2.jpg` },
    { id: "p-006", filename: "Meg.jpg", folderId: "eglise", watermarkedUrl: `${imageBase}/Meg.jpg` },
    { id: "p-007", filename: "Meg33.jpg", folderId: "eglise", watermarkedUrl: `${imageBase}/Meg33.jpg` },
    { id: "p-008", filename: "Megane1.jpg", folderId: "soiree", watermarkedUrl: `${imageBase}/Megane1.jpg` },
    { id: "p-009", filename: "Megane2.jpg", folderId: "soiree", watermarkedUrl: `${imageBase}/Megane2.jpg` }
  ]
};

export const activeProjects = [demoProject];

export function findProject(projectId: string): Project | undefined {
  return activeProjects.find((project) => project.id === projectId);
}

export function calculateExtraPrice(extraCount: number, project: Project): number {
  if (extraCount <= 0) return 0;
  const tier = project.priceGrid.find((item) => extraCount >= item.min && (item.max === null || extraCount <= item.max));
  return extraCount * (tier?.unitPrice ?? 0);
}
