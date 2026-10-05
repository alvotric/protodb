"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

export interface AdminProject {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  google_enabled: boolean;
}

function apiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

export function ProjectsWorkspace() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store", signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Projects could not be loaded."));
      if (!payload || typeof payload !== "object" || !("projects" in payload) || !Array.isArray((payload as { projects: unknown }).projects)) {
        throw new Error("The projects API returned invalid data.");
      }
      if (!signal.aborted) setProjects((payload as { projects: AdminProject[] }).projects);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Projects could not be loaded.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Project could not be created."));
      setCreateOpen(false);
      setSlug("");
      setName("");
      setRetry((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Project could not be created.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading projects" className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Projects unavailable"
        description={error}
        action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Supabase-style project Auth lives here. Each project owns its Google provider, redirect URLs, users, and sessions.
        </p>
        <Button size="sm" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
          <Plus className="h-3.5 w-3.5" />
          New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No projects yet"
          description="Create a project to set up Google Auth for an external app."
          action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" />New project</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${encodeURIComponent(project.slug)}`}>
              <Card className="p-5 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <Badge tone={project.google_enabled ? "success" : "neutral"} dot>
                    {project.google_enabled ? "Google on" : "Google off"}
                  </Badge>
                </div>
                <p className="mt-4 text-[15px] font-medium text-ink">{project.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{project.slug}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => { if (!creating) setCreateOpen(false); }}
        title="Create project"
        description="Projects own separate Auth users, sessions, and Google provider settings."
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button size="sm" onClick={() => void handleCreate()} loading={creating} disabled={!slug.trim() || !name.trim()}>Create</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="project-slug">Slug</label>
            <Input id="project-slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="my-app" mono />
            <p className="mt-1 text-[11px] text-ink-faint">Lowercase letters, numbers, hyphens. Used in Auth API URLs and never changes.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="project-name">Name</label>
            <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My App" />
          </div>
          {createError && <p role="alert" className="text-xs text-danger">{createError}</p>}
        </div>
      </Modal>
    </div>
  );
}
