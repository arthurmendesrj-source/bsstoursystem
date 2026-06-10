// Server-only helpers for SMTP/IMAP email accounts.
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

export type ProviderId = "gmail" | "outlook" | "yahoo" | "icloud" | "other";

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  appPasswordHelpUrl?: string;
  notes?: string;
};

export const PROVIDER_PRESETS: Record<Exclude<ProviderId, "other">, ProviderPreset> = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_secure: true,
    imap_host: "imap.gmail.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://myaccount.google.com/apppasswords",
    notes: "Use uma senha de app (não a senha normal). Ative 2FA e gere em myaccount.google.com/apppasswords.",
  },
  outlook: {
    id: "outlook",
    label: "Outlook / Microsoft 365",
    smtp_host: "smtp-mail.outlook.com", smtp_port: 587, smtp_secure: false,
    imap_host: "outlook.office365.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://account.microsoft.com/security",
    notes: "Pode exigir senha de app no painel de segurança da Microsoft se 2FA estiver ativo.",
  },
  yahoo: {
    id: "yahoo",
    label: "Yahoo Mail",
    smtp_host: "smtp.mail.yahoo.com", smtp_port: 465, smtp_secure: true,
    imap_host: "imap.mail.yahoo.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://login.yahoo.com/account/security",
    notes: "Gere uma senha de app em Account Security → Generate app password.",
  },
  icloud: {
    id: "icloud",
    label: "iCloud Mail",
    smtp_host: "smtp.mail.me.com", smtp_port: 587, smtp_secure: false,
    imap_host: "imap.mail.me.com", imap_port: 993, imap_secure: true,
    appPasswordHelpUrl: "https://appleid.apple.com/account/manage",
    notes: "Gere uma senha específica de app em appleid.apple.com.",
  },
};

export type SmtpImapConfig = {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  auth_username: string;
  password: string;
};

export async function testSmtp(cfg: SmtpImapConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port,
      secure: cfg.smtp_secure,
      auth: { user: cfg.auth_username, pass: cfg.password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function testImap(cfg: SmtpImapConfig): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: cfg.imap_host,
    port: cfg.imap_port,
    secure: cfg.imap_secure,
    auth: { user: cfg.auth_username, pass: cfg.password },
    logger: false,
    socketTimeout: 20000,
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (e) {
    try { await client.close(); } catch { /* noop */ }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function buildTransport(cfg: SmtpImapConfig) {
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: cfg.smtp_port,
    secure: cfg.smtp_secure,
    auth: { user: cfg.auth_username, pass: cfg.password },
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });
}

export function buildImap(cfg: SmtpImapConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.imap_host,
    port: cfg.imap_port,
    secure: cfg.imap_secure,
    auth: { user: cfg.auth_username, pass: cfg.password },
    logger: false,
    socketTimeout: 20000,
  });
}
