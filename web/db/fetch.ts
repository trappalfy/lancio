/** Client-safe fetch for the forum/auth routes (same origin, cookie session). */
export class ForumError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ForumError";
  }
}

export async function forumFetch<T>(path: string, init: { method?: "GET" | "POST"; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      signal: init.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: init.json === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ForumError(0, "Network error. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ForumError(res.status, data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}
