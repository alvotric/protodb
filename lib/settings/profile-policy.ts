export const PROFILE_NAME_MAX_LENGTH = 120;

export function validateProfileName(value: unknown): { ok: true; name: string } | { ok: false; message: string } {
  if (typeof value !== "string") return { ok: false, message: "Name must be a string." };
  const name = value.trim();
  if (!name) return { ok: false, message: "Name can't be empty." };
  if (name.length > PROFILE_NAME_MAX_LENGTH) {
    return { ok: false, message: `Name must not exceed ${PROFILE_NAME_MAX_LENGTH} characters.` };
  }
  return { ok: true, name };
}
