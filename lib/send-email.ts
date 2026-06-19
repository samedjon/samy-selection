import nodemailer from "nodemailer";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getDataDir } from "./data-dir";

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

const dataDir = getDataDir();
const outboxDir = path.join(dataDir, "outbox");
const outboxFile = path.join(outboxDir, "emails.json");

type OutboxEntry = {
  id: string;
  to: string;
  subject: string;
  text: string;
  createdAt: string;
  status: "pending" | "sent" | "failed";
};

async function readOutbox(): Promise<OutboxEntry[]> {
  try {
    const raw = await readFile(outboxFile, "utf8");
    return JSON.parse(raw) as OutboxEntry[];
  } catch {
    return [];
  }
}

async function saveToOutbox(entry: Omit<OutboxEntry, "id" | "createdAt">): Promise<void> {
  const outbox: OutboxEntry = {
    ...entry,
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString()
  };
  const existing = await readOutbox();
  existing.push(outbox);
  await mkdir(outboxDir, { recursive: true });
  await writeFile(outboxFile, JSON.stringify(existing, null, 2), "utf8");
}

export async function getOutbox(): Promise<OutboxEntry[]> {
  return readOutbox();
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  // Always save to outbox
  await saveToOutbox({
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    status: "pending"
  });

  if (!host || !port || !user || !pass || !from) {
    console.info("[email] SMTP non configure. Message mis dans la file d'attente (data/outbox/).");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text
    });

    console.info("[email] Message envoye a", payload.to);
    return true;
  } catch (error) {
    console.error("[email] Erreur d'envoi:", error);
    return false;
  }
}
