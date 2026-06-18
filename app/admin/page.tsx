import AdminHome from "@/components/admin-home";
import { getCurrentUser } from "@/lib/admin-auth";

export default function AdminPage() {
  const user = getCurrentUser();
  return <AdminHome user={user} />;
}
