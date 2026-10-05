"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { ProjectAuthSection } from "@/components/projects/project-auth-section";
import { ProjectUsersSection } from "@/components/projects/project-users-section";
import type { AdminProject } from "@/components/projects/projects-workspace";

function apiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

type Tab = "overview" | "authentication" | "users";

export function ProjectDetailClient({ slug }: { slug: string }) {
  const [project, setProject] = useState<AdminProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [userCount, setUserCount] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamed, setRenamed] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store", signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Project could not be loaded."));
      const list = (payload as { projects: AdminProject[] }).projects;
      if (!Array.isArray(list)) throw new Error("The projects API returned invalid data.");
      const found = list.find((entry) => entry.slug === slug) ?? null;
      if (!signal.aborted) {
        if (!found) throw new Error(`No project with slug "${slug}" was found.`);
        setProject(found);
        setNameDraft(found.name);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Project could not be loaded.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);

  async function handleRename() {
    if (!project || renaming) return;
    setRenaming(true);
    setRenameError(null);
    setRenamed(false);
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "Project could not be renamed."));
      const updated = (payload as { project: AdminProject }).project;
      setProject((previous) => (previous ? { ...previous, name: updated.name } : previous));
      setEditingName(false);
      setRenamed(true);
      window.setTimeout(() => setRenamed(false), 2500);
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : "Project could not be renamed.");
    } finally {
      setRenaming(false);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading project" className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />Projects
        </Link>
        <ErrorState
          title="Project unavailable"
          description={error ?? "Project could not be loaded."}
          action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />Projects
      </Link>

      <Card className="px-4">
        <CardHeader>
          <div>
            <CardTitle>{project.name}</CardTitle>
            <CardDescription>
              Slug <span className="font-mono text-xs">{project.slug}</span> · isolated Auth scope for one external app.
            </CardDescription>
          </div>
          <Badge tone={project.google_enabled ? "success" : "neutral"} dot>
            {project.google_enabled ? "Auth on" : "Auth off"}
          </Badge>
        </CardHeader>
      </Card>

      <Tabs
        items={[
          { value: "overview", label: "Overview" },
          { value: "authentication", label: "Authentication" },
          { value: "users", label: "Users", ...(userCount === null ? {} : { count: userCount }) },
        ]}
        value={tab}
        onChange={(value) => { if (value === "overview" || value === "authentication" || value === "users") setTab(value); }}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="px-4">
            <CardHeader>
              <div>
                <CardTitle>Project</CardTitle>
                <CardDescription>Identity of this Auth scope.</CardDescription>
              </div>
              {!editingName && (
                <Button size="sm" variant="secondary" onClick={() => { setNameDraft(project.name); setEditingName(true); }}>
                  <Pencil className="h-3.5 w-3.5" />Rename
                </Button>
              )}
            </CardHeader>
            <div className="space-y-3 px-4 pb-4">
              {editingName ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="project-name">Name</label>
                    <Input id="project-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
                  </div>
                  {renameError && <p role="alert" className="text-xs text-danger">{renameError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    {renamed && (
                      <span role="status" className="flex items-center gap-1 text-xs text-success">
                        <Check className="h-3.5 w-3.5" />Saved
                      </span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} disabled={renaming}>Cancel</Button>
                    <Button size="sm" onClick={() => void handleRename()} loading={renaming} disabled={!nameDraft.trim()}>Save</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-faint">Name</span>
                    <span className="text-ink">{project.name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink-faint">Slug</span>
                    <span className="font-mono text-[13px] text-ink">{project.slug}</span>
                  </div>
                  {renamed && (
                    <p role="status" className="flex items-center gap-1 text-xs text-success">
                      <Check className="h-3.5 w-3.5" />Saved
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>

          <Card className="px-4">
            <CardHeader>
              <div>
                <CardTitle>Auth status</CardTitle>
                <CardDescription>Live state from the project Auth APIs.</CardDescription>
              </div>
            </CardHeader>
            <div className="space-y-2.5 px-4 pb-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-faint">Google provider</span>
                <Badge tone={project.google_enabled ? "success" : "neutral"} dot>
                  {project.google_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-faint">Project users</span>
                <span className="text-ink">{userCount === null ? "—" : userCount}</span>
              </div>
              <p className="text-xs text-ink-faint">Configure Google and redirect URLs under Authentication.</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "authentication" && (
        <ProjectAuthSection projectId={project.id} slug={project.slug} />
      )}

      {tab === "users" && (
        <Card className="px-4">
          <CardHeader>
            <div>
              <CardTitle>Project users</CardTitle>
              <CardDescription>Managed here. Suspending revokes their sessions immediately.</CardDescription>
            </div>
          </CardHeader>
          <div className="px-4 pb-4">
            <ProjectUsersSection projectId={project.id} onCountChange={setUserCount} />
          </div>
        </Card>
      )}

      {tab === "overview" && userCount === null && (
        <ProjectUsersPreload projectId={project.id} onCountChange={setUserCount} />
      )}
    </div>
  );
}

function ProjectUsersPreload({ projectId, onCountChange }: { projectId: string; onCountChange: (count: number) => void }) {
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/users`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) return;
        if (payload && typeof payload === "object" && "users" in payload && Array.isArray((payload as { users: unknown }).users)) {
          onCountChange((payload as { users: unknown[] }).users.length);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  return null;
}
