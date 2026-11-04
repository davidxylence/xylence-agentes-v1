import { google } from "googleapis";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

// Guarda el refresh token fuera del repo (.gitignore) — nunca toca el navegador.
const DIR_CREDENCIALES = path.resolve(process.cwd(), ".credentials");
const ARCHIVO_TOKEN = path.join(DIR_CREDENCIALES, "gmail-token.json");

export const SCOPES_GMAIL = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

type TokenGuardado = {
  email: string;
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
};

function clienteOAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI ?? "http://localhost:5174/api/conectores/gmail/callback";
  if (!clientId || !clientSecret) {
    throw new Error("Falta GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET en .env");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function gmailConfigurado(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

export function urlDeAutorizacion(): string {
  const oauth2Client = clienteOAuth();
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // necesario para recibir refresh_token
    prompt: "consent", // fuerza a Google a reemitir el refresh_token aunque ya hayas autorizado antes
    scope: SCOPES_GMAIL,
  });
}

async function leerTokenGuardado(): Promise<TokenGuardado | null> {
  try {
    const raw = await readFile(ARCHIVO_TOKEN, "utf-8");
    return JSON.parse(raw) as TokenGuardado;
  } catch {
    return null;
  }
}

export async function intercambiarCodigo(code: string): Promise<{ email: string }> {
  const oauth2Client = clienteOAuth();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google no devolvió un refresh_token. Si ya habías conectado esta cuenta antes, revócala en " +
      "https://myaccount.google.com/permissions y vuelve a intentar."
    );
  }
  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const perfil = await gmail.users.getProfile({ userId: "me" });
  const email = perfil.data.emailAddress ?? "desconocido";

  await mkdir(DIR_CREDENCIALES, { recursive: true });
  const guardado: TokenGuardado = {
    email,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  };
  await writeFile(ARCHIVO_TOKEN, JSON.stringify(guardado, null, 2));
  return { email };
}

export async function estadoGmail(): Promise<{ conectado: boolean; email?: string; configurado: boolean }> {
  const configurado = gmailConfigurado();
  const token = await leerTokenGuardado();
  return { conectado: Boolean(token), email: token?.email, configurado };
}

export async function desconectarGmail(): Promise<void> {
  await rm(ARCHIVO_TOKEN, { force: true });
}

/** Cliente OAuth ya autenticado y listo para llamar la API de Gmail, o null si no hay sesión guardada. */
export async function clienteGmailAutorizado() {
  const token = await leerTokenGuardado();
  if (!token) return null;
  const oauth2Client = clienteOAuth();
  oauth2Client.setCredentials({ refresh_token: token.refresh_token });
  return { oauth2Client, email: token.email };
}
