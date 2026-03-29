const API = import.meta.env.VITE_API_URL ?? "";

export function apiUrl(path: string): string {
  const base = API.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  return fetch(apiUrl(path), { ...init, headers });
}
