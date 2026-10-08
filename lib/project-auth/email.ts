import { query } from "../db/client.ts";
import { getSmtpConfig, sendSmtpMail } from "./smtp.ts";
import { buildAuthEmailContent } from "./email-content.ts";
import type { EmailTokenPurpose } from "./email-tokens.ts";

/**
 * Project auth email delivery. SMTP is configured purely by env
 * (localhost-friendly: point SMTP_HOST at a relay like Mailpit with no
 * auth). When SMTP is absent, nothing leaves the machine: the email is
 * stored in the outbox as pending and the link is printed to the server
 * console so local flows stay usable with zero config.
 */

export interface EmailDispatchResult {
  sent: boolean;
  outboxId: string | null;
}

/**
 * Sends (or outboxes) an auth email. Never throws: delivery failure is
 * recorded on the outbox row so signup/login never break on mail trouble.
 */
export async function sendProjectAuthEmail(input: {
  projectId: string;
  userId: string;
  purpose: EmailTokenPurpose;
  email: string;
  link: string;
  projectSlug: string;
}): Promise<EmailDispatchResult> {
  const { subject, text, html } = buildAuthEmailContent({
    purpose: input.purpose,
    email: input.email,
    link: input.link,
    projectSlug: input.projectSlug,
  });
  const rows = await query<{ id: string }>(
    `insert into protodb_admin.project_auth_email_outbox
       (project_id, project_user_id, purpose, to_email, subject, body_text, body_html)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [input.projectId, input.userId, input.purpose, input.email, subject, text, html]
  ).catch(() => []);
  const outboxId = rows[0]?.id ?? null;

  let smtp: ReturnType<typeof getSmtpConfig>;
  try {
    smtp = getSmtpConfig();
  } catch (error) {
    await markOutbox(outboxId, false, error instanceof Error ? error.message : "SMTP misconfigured.");
    return { sent: false, outboxId };
  }
  if (!smtp) {
    console.log(`[protodb auth email] (${input.purpose}) to ${input.email}: ${input.link}`);
    return { sent: false, outboxId };
  }
  try {
    await sendSmtpMail(smtp, { to: input.email, subject, text, html });
    await markOutbox(outboxId, true, null);
    return { sent: true, outboxId };
  } catch (error) {
    await markOutbox(outboxId, false, error instanceof Error ? error.message : "SMTP send failed.");
    return { sent: false, outboxId };
  }
}

async function markOutbox(outboxId: string | null, sent: boolean, error: string | null): Promise<void> {
  if (!outboxId) return;
  await query(
    `update protodb_admin.project_auth_email_outbox
     set sent_at = case when $2 then now() else null end, error = $3
     where id = $1`,
    [outboxId, sent, error]
  ).catch(() => undefined);
}
