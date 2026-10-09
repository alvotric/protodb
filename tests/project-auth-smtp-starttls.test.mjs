import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { ehloAdvertisesStarttls, sendSmtpMail } from "../lib/project-auth/smtp.ts";

// Regression tests for the Gmail STARTTLS bug: SmtpConnection used to
// discard SMTP multiline continuation lines, so STARTTLS advertised on
// an EHLO continuation line (Gmail's shape) was never detected and AUTH
// went out over plaintext, yielding
// "530 5.7.0 Must issue a STARTTLS command first".
// All servers below are local mocks; no real email is ever sent and all
// credentials here are dummy values. Assertions inspect command verbs
// only — AUTH payloads are never logged or asserted on.

// ---------------------------------------------------------------------------
// EHLO capability parser.
// ---------------------------------------------------------------------------

test("ehloAdvertisesStarttls detects STARTTLS on continuation and final lines", () => {
  assert.equal(
    ehloAdvertisesStarttls("250-smtp.gmail.com at your service\r\n250-STARTTLS\r\n250 SMTPUTF8"),
    true,
    "continuation-line STARTTLS must be detected"
  );
  assert.equal(ehloAdvertisesStarttls("250-smtp.gmail.com at your service\r\n250 STARTTLS"), true);
  assert.equal(ehloAdvertisesStarttls("250 mock\r\n250-starttls\r\n250 HELP"), true, "match is case-insensitive");
  assert.equal(ehloAdvertisesStarttls("250 mock-relay greets tester"), false);
  assert.equal(ehloAdvertisesStarttls("250-fake\r\n250 AUTH PLAIN LOGIN"), false);
  assert.equal(ehloAdvertisesStarttls("250-XSTARTTLS\r\n250 HELP"), false, "partial token must not match");
  assert.equal(ehloAdvertisesStarttls("550-STARTTLS\r\n550 denied"), false, "non-250 replies must not match");
  assert.equal(ehloAdvertisesStarttls(""), false);
});

// ---------------------------------------------------------------------------
// Mock-server helpers.
// ---------------------------------------------------------------------------

function startMockServer(onLine) {
  const conversations = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 mock-relay ESMTP\r\n");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        conversations.push(line);
        onLine(socket, line, conversations);
      }
    });
  });
  return { server, conversations };
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

const GMAIL_SHAPE_EHLO =
  "250-smtp.gmail.com at your service\r\n" +
  "250-SIZE 35882577\r\n" +
  "250-8BITMIME\r\n" +
  "250-STARTTLS\r\n" +
  "250-ENHANCEDSTATUSCODES\r\n" +
  "250 SMTPUTF8\r\n";

function completeDelivery(socket, line, stage) {
  if (line.startsWith("AUTH PLAIN")) {
    socket.write("235 ok\r\n");
    return "mail";
  }
  if (line === "AUTH LOGIN") {
    socket.write("334 VXNlcm5hbWU6\r\n");
    return "login-user";
  }
  if (stage === "login-user") {
    socket.write("334 UGFzc3dvcmQ6\r\n");
    return "login-pass";
  }
  if (stage === "login-pass") {
    socket.write("235 ok\r\n");
    return "mail";
  }
  if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) {
    socket.write("250 ok\r\n");
    return stage;
  }
  if (line === "DATA") {
    socket.write("354 end with .\r\n");
    return "data";
  }
  if (stage === "data") {
    if (line === ".") socket.write("250 queued\r\n");
    return line === "." ? "mail" : "data";
  }
  if (line === "QUIT") {
    socket.write("221 bye\r\n");
    socket.end();
    return stage;
  }
  return stage;
}

// ---------------------------------------------------------------------------
// STARTTLS negotiation.
// ---------------------------------------------------------------------------

test("STARTTLS is sent before AUTH when advertised on an EHLO continuation line", async () => {
  const { server, conversations } = startMockServer((socket, line) => {
    if (line.startsWith("EHLO")) {
      socket.write(GMAIL_SHAPE_EHLO);
    } else if (line === "STARTTLS") {
      // The mock speaks no TLS: answer 220, flush it, then close so the
      // client's upgrade attempt fails fast instead of hanging.
      socket.end("220 2.0.0 Ready to start TLS\r\n");
    }
  });
  const port = await listen(server);
  try {
    await assert.rejects(
      sendSmtpMail(
        { host: "127.0.0.1", port, secure: "starttls", user: "u", pass: "p", from: "noreply@example.com", timeoutMs: 3000 },
        { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
      ),
      "TLS upgrade against a non-TLS mock must fail"
    );
    assert.ok(conversations.some((l) => l.startsWith("EHLO")), "must send EHLO first");
    assert.ok(conversations.includes("STARTTLS"), "must send STARTTLS once detected");
    assert.ok(
      !conversations.some((l) => l.startsWith("AUTH")),
      "must not send AUTH in plaintext before the TLS upgrade"
    );
    const verbs = conversations.map((l) => l.split(" ")[0]);
    assert.deepEqual(verbs.slice(0, 2), ["EHLO", "STARTTLS"], "STARTTLS must immediately follow EHLO");
  } finally {
    server.close();
  }
});

test("starttls mode fails closed when the multiline EHLO omits STARTTLS", async () => {
  const { server, conversations } = startMockServer((socket, line) => {
    if (line.startsWith("EHLO")) {
      socket.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
    }
  });
  const port = await listen(server);
  try {
    await assert.rejects(
      sendSmtpMail(
        { host: "127.0.0.1", port, secure: "starttls", user: "u", pass: "p", from: "noreply@example.com", timeoutMs: 5000 },
        { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
      ),
      /STARTTLS required but not advertised/,
      "must fail with a clear error instead of AUTHing in plaintext"
    );
    assert.ok(!conversations.some((l) => l.startsWith("AUTH")), "must never AUTH in STARTTLS mode without TLS");
    assert.ok(!conversations.some((l) => l.startsWith("MAIL FROM")), "must not proceed to delivery");
  } finally {
    server.close();
  }
});

test("starttls mode fails closed when STARTTLS is rejected (no 220)", async () => {
  const { server, conversations } = startMockServer((socket, line) => {
    if (line.startsWith("EHLO")) {
      socket.write(GMAIL_SHAPE_EHLO);
    } else if (line === "STARTTLS") {
      socket.write("502 Command not implemented\r\n");
    }
  });
  const port = await listen(server);
  try {
    await assert.rejects(
      sendSmtpMail(
        { host: "127.0.0.1", port, secure: "starttls", user: "u", pass: "p", from: "noreply@example.com", timeoutMs: 5000 },
        { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
      ),
      /STARTTLS/,
      "a non-220 STARTTLS reply must abort before AUTH"
    );
    assert.ok(!conversations.some((l) => l.startsWith("AUTH")), "no AUTH without a successful TLS upgrade");
  } finally {
    server.close();
  }
});

test("single-line EHLO delivers in plain mode (existing behavior)", async () => {
  const { server, conversations } = startMockServer((socket, line) => {
    if (line.startsWith("EHLO")) {
      socket.write("250 mock-relay greets tester\r\n");
      socket._stage = "mail";
    } else {
      socket._stage = completeDelivery(socket, line, socket._stage);
    }
  });
  const port = await listen(server);
  try {
    await sendSmtpMail(
      { host: "127.0.0.1", port, secure: "none", from: "noreply@example.com", timeoutMs: 5000 },
      { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
    );
    assert.ok(!conversations.includes("STARTTLS"));
    assert.ok(conversations.some((l) => l.startsWith("MAIL FROM:<noreply@example.com>")));
    assert.ok(conversations.includes("QUIT"));
  } finally {
    server.close();
  }
});

test("plain mode ignores STARTTLS even when advertised (existing behavior)", async () => {
  const { server, conversations } = startMockServer((socket, line) => {
    if (line.startsWith("EHLO")) {
      socket.write(GMAIL_SHAPE_EHLO);
      socket._stage = "mail";
    } else {
      socket._stage = completeDelivery(socket, line, socket._stage);
    }
  });
  const port = await listen(server);
  try {
    await sendSmtpMail(
      { host: "127.0.0.1", port, secure: "none", user: "u", pass: "p", from: "noreply@example.com", timeoutMs: 5000 },
      { to: "user@example.com", subject: "hi", text: "hello", html: "<p>hello</p>" }
    );
    assert.ok(!conversations.includes("STARTTLS"), "plain mode must never upgrade");
    assert.ok(conversations.some((l) => l.startsWith("AUTH PLAIN")));
    assert.ok(conversations.includes("QUIT"));
  } finally {
    server.close();
  }
});
