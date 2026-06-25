export type SelectionType = "start" | "premium" | "enlargement";

export type PriceTier = {
  min: number;
  max: number | null;
  unitPrice: number;
};

export type Photo = {
  id: string;
  filename: string;
  folderId: string;
  watermarkedUrl: string;
  cloudinaryPublicId?: string;
  relativePath?: string;
};

export type Folder = {
  id: string;
  name: string;
  parentId?: string;
  displayOrder: number;
};

export type Project = {
  id: string;
  coupleName: string;
  eventDate: string;
  venue: string;
  coverImageUrl: string;
  passwordHash: string;
  accessCode?: string;
  eventType?: string;
  notificationEmail?: string;
  notificationWhatsapp?: string;
  driveUrl?: string;
  isArchived?: boolean;
  source?: "demo" | "local" | "server";
  quotas: Record<SelectionType, number>;
  priceGrid: PriceTier[];
  folders: Folder[];
  photos: Photo[];
};

export type SelectionState = Record<SelectionType, string[]>;

export type ConfirmationPayload = {
  projectId: string;
  selections: SelectionState;
};
