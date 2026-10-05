export interface ProjectUser {
  id: string;
  projectId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  status: "active" | "suspended";
}

export type ProjectUpsertDecision =
  | { kind: "login"; user: ProjectUser }
  | { kind: "provision" }
  | { kind: "reject"; reason: "suspended" };

/**
 * Pure mapping decision (unit-testable, no I/O). A linked subject logs
 * straight in; anything else flows into verified-email provisioning,
 * which creates the user on first sight or attaches the subject to the
 * same-email user. Suspended project users are always rejected — Google
 * login never bypasses a suspension.
 */
export function decideProjectUpsert(input: {
  linkedUser: ProjectUser | null;
}): ProjectUpsertDecision {
  if (input.linkedUser) {
    if (input.linkedUser.status === "suspended") return { kind: "reject", reason: "suspended" };
    return { kind: "login", user: input.linkedUser };
  }
  return { kind: "provision" };
}
