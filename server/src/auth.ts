import { OAuth2Client, type Credentials } from "google-auth-library";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];
const TOKENS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../data/tokens.json");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en .env (mira .env.example)`);
  return value;
}

export function createClient(): OAuth2Client {
  return new OAuth2Client(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    requireEnv("GOOGLE_REDIRECT_URI"),
  );
}

export function authUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // fuerza a Google a devolver refresh_token
    scope: SCOPES,
  });
}

async function saveTokens(tokens: Credentials): Promise<void> {
  await mkdir(dirname(TOKENS_PATH), { recursive: true });
  await writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function loadTokens(): Promise<Credentials | null> {
  try {
    return JSON.parse(await readFile(TOKENS_PATH, "utf8")) as Credentials;
  } catch {
    return null;
  }
}

/** Cierra la sesión: borra los tokens guardados (no revoca el permiso en Google). */
export async function clearTokens(): Promise<void> {
  await rm(TOKENS_PATH, { force: true });
}

/** El acceso a Google ya no es válido (refresh token caducado o revocado). */
export function isAuthExpired(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
  return e.response?.data?.error === "invalid_grant" || e.response?.status === 401 || e.message === "invalid_grant";
}

export async function handleCallback(client: OAuth2Client, code: string): Promise<void> {
  const { tokens } = await client.getToken(code);
  await saveTokens(tokens);
}

/** Devuelve un cliente autenticado, o null si no hay sesión guardada. */
export async function authedClient(): Promise<OAuth2Client | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;
  const client = createClient();
  client.setCredentials(tokens);
  // Conserva el refresh_token cuando Google renueva el access_token.
  client.on("tokens", (fresh) => {
    void saveTokens({ ...tokens, ...fresh });
  });
  return client;
}
