import { APP_ROLES, type AppRole } from "../auth/role-capabilities";

export type UserAdminChange = { role?: AppRole; status?: "active" | "suspended" };

export class UserAdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminValidationError";
  }
}

export function isUsersAdmin(role: AppRole): boolean {
  return role === "Owner";
}

export function parseUserAdminChange(value: unknown): UserAdminChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UserAdminValidationError("Request body must be an object.");
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 1 || !["role", "status"].includes(keys[0])) {
    throw new UserAdminValidationError("Change exactly one supported member field.");
  }
  if (keys[0] === "role") {
    if (typeof body.role !== "string" || !APP_ROLES.includes(body.role as AppRole)) {
      throw new UserAdminValidationError("Choose a supported role.");
    }
    return { role: body.role as AppRole };
  }
  if (body.status !== "active" && body.status !== "suspended") {
    throw new UserAdminValidationError("Status must be active or suspended.");
  }
  return { status: body.status };
}

export function canChangeMember(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}
