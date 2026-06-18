import { cookies } from "next/headers";
import SelectionPortal from "@/components/selection-portal";
import { listActiveServerProjects } from "@/lib/server-project-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cookieStore = cookies();
  const raw = cookieStore.get("samy_admin_session")?.value;
  let isAdmin = false;
  let adminUser: { email: string; name: string } | null = null;
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.email && parsed.name) {
        isAdmin = true;
        adminUser = { email: parsed.email, name: parsed.name };
      }
    }
  } catch {
    if (raw === "authenticated") isAdmin = true;
  }

  const serverProjects = await listActiveServerProjects();
  return <SelectionPortal projects={serverProjects} isAdmin={isAdmin} adminUser={adminUser} />;
}
