import type { EmailTokenPurpose } from "./email-tokens.ts";

/**
 * Pure auth-email content (no I/O, no imports beyond types) so templates
 * stay unit-testable without database or SMTP configuration.
 */

export interface AuthEmailLink {
  purpose: EmailTokenPurpose;
  email: string;
  link: string;
  projectSlug: string;
}

export interface AuthEmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function templates(input: AuthEmailLink): AuthEmailContent {
  const safeEmail = escapeHtml(input.email);
  const safeLink = escapeHtml(input.link);
  if (input.purpose === "verify") {
    return {
      subject: "Verify your email address",
      text: `Welcome!\n\nConfirm this email address to finish creating your account (${input.email}):\n\n${input.link}\n\nThis link expires in 24 hours. If you did not sign up, ignore this email.`,
      html: `<p>Welcome!</p><p>Confirm <strong>${safeEmail}</strong> to finish creating your account:</p><p><a href="${safeLink}">Verify email address</a></p><p>This link expires in 24 hours. If you did not sign up, ignore this email.</p>`,
    };
  }
  return {
    subject: "Reset your password",
    text: `We received a password-reset request for ${input.email}.\n\nChoose a new password here:\n\n${input.link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    html: `<p>We received a password-reset request for <strong>${safeEmail}</strong>.</p><p><a href="${safeLink}">Choose a new password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>`,
  };
}

/** Pure content builder (unit-testable, no I/O). All user input is HTML-escaped. */
export function buildAuthEmailContent(input: AuthEmailLink): AuthEmailContent {
  return templates(input);
}
