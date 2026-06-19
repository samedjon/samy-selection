"use client";

import { useEffect, useState } from "react";
import SelectionPortal from "@/components/selection-portal";
import type { Project } from "@/types/selection";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => { setProjects(Array.isArray(data) ? data : []); })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-studio">
        <p className="text-ink/60">Chargement...</p>
      </div>
    );
  }

  return <SelectionPortal projects={projects} isAdmin={false} />;
}
