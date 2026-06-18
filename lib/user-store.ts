import "server-only";

import bcrypt from "bcryptjs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@/lib/supabase/server";

const dataDir = path.join(process.cwd(), "data");
const usersFile = path.join(dataDir, "users.json");

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return url !== "" && key !== "" && !url.includes("votre-projet") && !key.includes("votre-cle");
}

// ---- JSON file helpers ----

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await readFile(usersFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users: StoredUser[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(usersFile, JSON.stringify(users, null, 2), "utf8");
}

// ---- Exports ----

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data } = await supabase.from("admin_users").select("*").eq("email", email.toLowerCase()).single();
    if (data) {
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        passwordHash: data.password_hash,
        createdAt: data.created_at
      };
    }
    return undefined;
  }
  const users = await readUsers();
  return users.find((u) => u.email === email.toLowerCase());
}

export async function createUser(email: string, name: string, password: string): Promise<StoredUser> {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: `user-${Date.now()}`,
    email: email.toLowerCase(),
    name,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("admin_users")
      .insert({ email: user.email, name: user.name, password_hash: user.passwordHash })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    user.id = data.id;
    return user;
  }

  const users = await readUsers();
  if (users.some((u) => u.email === user.email)) {
    throw new Error("Un compte avec cet email existe deja.");
  }
  users.push(user);
  await writeUsers(users);
  return user;
}

export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
