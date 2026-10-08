import { connect, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";

/**
 * Minimal dependency-free SMTP client for transactional auth mail.
 * Supports plain SMTP (localhost relays like Mailpit), STARTTLS upgrade,
 * direct TLS (SMTPS), and AUTH PLAIN / AUTH LOGIN. Only what project
 * auth needs: single recipient, text + html alternatives, short timeouts.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  /** "ssl" = direct TLS (465); "starttls" = upgrade when offered; "none" = plain. */
  secure: "ssl" | "starttls" | "none";
  user?: string;
  pass?: string;
  from: string;
  fromName?: string;
  timeoutMs: number;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  if (!host) return null;
  const portRaw = (process.env.SMTP_PORT ?? "").trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : 0;
  const mode = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
  const secure: SmtpConfig["secure"] =
    mode === "ssl" || mode === "smtps" ? "ssl" : mode === "none" ? "none" : "starttls";
  const resolvedPort = Number.isFinite(port) && port > 0 ? port : secure === "ssl" ? 465 : 587;
  const user = (process.env.SMTP_USER ?? "").trim() || undefined;
  const pass = process.env.SMTP_PASS ?? undefined;
  const from = (process.env.SMTP_FROM ?? "").trim();
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    throw new Error("SMTP_FROM must be a valid email address when SMTP_HOST is set.");
  }
  return {
    host,
    port: resolvedPort,
    secure,
    user,
    pass,
    from,
    fromName: (process.env.SMTP_FROM_NAME ?? "").trim() || undefined,
    timeoutMs: 15_000,
  };
}

export interface SmtpMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

class SmtpConnection {
  private socket: Socket;
  private readonly timeoutMs: number;
  private buffer = "";
  private waiters: Array<{ resolve: (line: string) => void; reject: (err: Error) => void }> = [];
  private closed = false;

  constructor(socket: Socket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("timeout", () => this.failAll(new Error("SMTP connection timed out.")));
    socket.on("error", (err) => this.failAll(err));
    socket.on("close", () => {
      this.closed = true;
      this.failAll(new Error("SMTP connection closed."));
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\r\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      // Multi-line replies continue while the 4th char is "-".
      if (/^\d{3}-/.test(line)) continue;
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(line);
    }
  }

  private failAll(err: Error): void {
    const pending = this.waiters;
    this.waiters = [];
    for (const w of pending) w.reject(err);
  }

  readReply(): Promise<string> {
    if (this.closed) return Promise.reject(new Error("SMTP connection closed."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.resolve === resolve);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error("SMTP reply timed out."));
      }, this.timeoutMs);
      this.waiters.push({
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  send(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  async command(line: string, expect: number[]): Promise<string> {
    this.send(line);
    const reply = await this.readReply();
    const code = Number.parseInt(reply.slice(0, 3), 10);
    if (!expect.includes(code)) {
      throw new Error(`SMTP command failed (${line.split(" ")[0]}): ${reply}`);
    }
    return reply;
  }

  upgradeToTls(host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tlsSocket = connectTls({
        socket: this.socket,
        servername: host,
        timeout: this.timeoutMs,
      });
      tlsSocket.once("secureConnect", () => {
        this.socket.removeAllListeners();
        this.socket = tlsSocket as unknown as Socket;
        const sock = this.socket;
        sock.setEncoding("utf8");
        sock.setTimeout(this.timeoutMs);
        sock.on("data", (chunk: string) => this.onData(chunk));
        sock.on("timeout", () => this.failAll(new Error("SMTP connection timed out.")));
        sock.on("error", (err: Error) => this.failAll(err));
        sock.on("close", () => {
          this.closed = true;
          this.failAll(new Error("SMTP connection closed."));
        });
        resolve();
      });
      tlsSocket.once("error", reject);
    });
  }

  close(): void {
    try {
      this.socket.end();
    } catch {
      // Best-effort close.
    }
  }
}

function dotStuff(body: string): string {
  return body
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function buildMime(from: string, fromName: string | undefined, msg: SmtpMessage): string {
  const boundary = `protodb-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
  const sender = fromName ? `${fromName} <${from}>` : from;
  const normalize = (s: string): string => s.replace(/\r?\n/g, "\r\n");
  return [
    `From: ${sender}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalize(msg.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalize(msg.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Sends one message. Throws with a short reason on any SMTP failure. */
export async function sendSmtpMail(config: SmtpConfig, msg: SmtpMessage): Promise<void> {
  const openSocket = (): Promise<Socket> =>
    new Promise((resolve, reject) => {
      if (config.secure === "ssl") {
        const s = connectTls(
          { host: config.host, port: config.port, servername: config.host, timeout: config.timeoutMs },
          () => resolve(s as unknown as Socket)
        );
        s.once("error", reject);
      } else {
        const s = connect({ host: config.host, port: config.port, timeout: config.timeoutMs }, () =>
          resolve(s)
        );
        s.once("error", reject);
      }
    });

  const socket = await openSocket();
  const conn = new SmtpConnection(socket, config.timeoutMs);
  try {
    const greeting = await conn.readReply();
    if (!/^2/.test(greeting)) throw new Error(`SMTP greeting rejected: ${greeting}`);
    const ehlo = await conn.command(`EHLO ${config.host}`, [250]);
    if (config.secure === "starttls" && /^250[ -].*STARTTLS/im.test(ehlo)) {
      await conn.command("STARTTLS", [220]);
      await conn.upgradeToTls(config.host);
      await conn.command(`EHLO ${config.host}`, [250]);
    }
    if (config.user) {
      const secret = config.pass ?? "";
      try {
        const payload = Buffer.from(`\0${config.user}\0${secret}`, "utf8").toString("base64");
        await conn.command(`AUTH PLAIN ${payload}`, [235]);
      } catch {
        await conn.command("AUTH LOGIN", [334]);
        await conn.command(Buffer.from(config.user, "utf8").toString("base64"), [334]);
        await conn.command(Buffer.from(secret, "utf8").toString("base64"), [235]);
      }
    }
    await conn.command(`MAIL FROM:<${config.from}>`, [250]);
    await conn.command(`RCPT TO:<${msg.to}>`, [250, 251]);
    await conn.command("DATA", [354]);
    conn.send(dotStuff(buildMime(config.from, config.fromName, msg)));
    conn.send(".");
    const dataReply = await conn.readReply();
    if (!/^2/.test(dataReply)) throw new Error(`SMTP DATA rejected: ${dataReply}`);
    try {
      await conn.command("QUIT", [221]);
    } catch {
      // Delivery already accepted; quit failures are cosmetic.
    }
  } finally {
    conn.close();
  }
}
