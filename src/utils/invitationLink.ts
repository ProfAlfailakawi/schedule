export type InvitationCredentials = { username: string; password: string };
export const DEFAULT_INVITATION_PASSWORD = "12345678";

/** Short enough to be recognised as a link in a shared invitation image. */
export function photoInvitationHref(site: string, username: string, password: string): string | null {
  return password === DEFAULT_INVITATION_PASSWORD ? `${site}i/${encodeURIComponent(username)}` : null;
}

/** Keep credentials in the URL fragment, which browsers never send to the server. */
export function invitationHref(site: string, username: string, password: string): string {
  const payload = new URLSearchParams({ username, password }).toString();
  return `${site}#invite=${encodeURIComponent(payload)}`;
}

export function isInvitationHash(hash: string): boolean {
  return hash.startsWith("#invite=") || hash.startsWith("#invite&");
}

/** Read both the current single-parameter link and links already sent in WhatsApp. */
export function parseInvitationHash(hash: string): InvitationCredentials | null {
  let payload: string;
  if (hash.startsWith("#invite=")) {
    try { payload = decodeURIComponent(hash.slice("#invite=".length)); }
    catch { return null; }
  } else if (hash.startsWith("#invite&")) {
    payload = hash.slice("#invite&".length);
  } else return null;

  const params = new URLSearchParams(payload);
  const username = params.get("username")?.slice(0, 200) || "";
  const password = params.get("password")?.slice(0, 128) || "";
  return username && password ? { username, password } : null;
}
