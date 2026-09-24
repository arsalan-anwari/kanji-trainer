import { parseContent } from "../content/load";
import type { Content } from "../content/types";
import { inTauri } from "../storage";
import {
  byShelf,
  parseCatalog,
  parseInstalled,
  type CatalogEntry,
  type InstalledPack,
  type PackMeta
} from "./catalog";
import { packUrl, setPackRoot } from "./url";

export type Progress = { done: number; total: number };

export type InstallEvent = { event: "progress"; data: Progress };

export type CatalogResult = { packs: CatalogEntry[]; fresh: boolean };

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function preparePacks(): Promise<void> {
  if (!inTauri()) return;
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  setPackRoot(convertFileSrc(await join(await appDataDir(), "packs")));
}

async function servedPacks(): Promise<unknown[]> {
  const ids = await fetchJson("/packs/index.json");
  if (!Array.isArray(ids)) return [];
  const ours = ids.filter((id): id is string => typeof id === "string");
  return Promise.all(ours.map((id) => fetchJson(packUrl(id, "pack.json"))));
}

export async function listInstalled(): Promise<InstalledPack[]> {
  let raw: unknown[];
  try {
    raw = inTauri() ? await call<unknown[]>("list_packs", {}) : await servedPacks();
  } catch {
    raw = [];
  }
  return raw
    .flatMap((value) => {
      const pack = parseInstalled(value);
      return pack === null ? [] : [pack];
    })
    .sort(byShelf);
}

export async function loadPackContent(id: string): Promise<Content | null> {
  return parseContent(await fetchJson(packUrl(id, "content.json")));
}

export async function loadDescription(meta: PackMeta): Promise<string | null> {
  if (meta.description === "") return null;
  if (inTauri()) {
    try {
      return await call<string>("read_description", { id: meta.id });
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch(packUrl(meta.id, meta.description), { cache: "no-store" });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export async function fetchCatalog(): Promise<CatalogResult | null> {
  if (!inTauri()) {
    const packs = parseCatalog(await fetchJson("/catalog.json"));
    return packs === null ? null : { packs, fresh: true };
  }
  try {
    const reply = await call<{ catalog: unknown; fresh: boolean }>("fetch_catalog", {});
    const packs = parseCatalog(reply.catalog);
    return packs === null ? null : { packs, fresh: reply.fresh };
  } catch {
    return null;
  }
}

export function canInstall(): boolean {
  return inTauri();
}

export async function installPack(id: string, onProgress: (progress: Progress) => void): Promise<boolean> {
  if (!inTauri()) return false;
  const { Channel } = await import("@tauri-apps/api/core");
  const channel = new Channel<InstallEvent>();
  channel.onmessage = (message) => {
    if (message.event === "progress") onProgress(message.data);
  };
  try {
    await call<null>("install_pack", { id, onEvent: channel });
    return true;
  } catch {
    return false;
  }
}

export async function deletePack(id: string): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    await call<null>("delete_pack", { id });
    return true;
  } catch {
    return false;
  }
}
