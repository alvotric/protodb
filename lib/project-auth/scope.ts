export class ProjectAuthError extends Error {
  readonly status: number;
  /** Machine-readable code for client UX mapping (e.g. "email_not_verified"). Optional. */
  readonly code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ProjectAuthError";
    this.status = status;
    this.code = code;
  }
}

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
}

/**
 * Project slugs are URL path segments and stable identifiers: lowercase
 * letters, numbers, and interior hyphens, 3–63 chars (same shape as
 * storage bucket names).
 */
export function validateProjectSlug(value: unknown): string {
  if (typeof value !== "string") throw new ProjectAuthError("Project reference is invalid.", 404);
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(slug)) {
    throw new ProjectAuthError("Project reference is invalid.", 404);
  }
  return slug;
}

export function validateProjectName(value: unknown): string {
  if (typeof value !== "string") throw new ProjectAuthError("Project name must be a string.");
  const name = value.trim();
  if (name.length === 0 || name.length > 100) {
    throw new ProjectAuthError("Project name must be between 1 and 100 characters.");
  }
  return name;
}
