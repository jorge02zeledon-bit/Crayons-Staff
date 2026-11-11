import { Redis } from "@upstash/redis";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Key/value storage for the schedule document and clock punches.
 *
 * On Vercel, add Upstash Redis from the project's Storage tab: it injects
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (older "KV" integrations use
 * KV_REST_API_URL / KV_REST_API_TOKEN; both are accepted). Without those, data is
 * kept in a local file (.data/ in development, /tmp on a server), which is fine
 * for trying the site but is wiped on every deploy.
 */
export type StorageMode = "redis" | "file" | "temporary";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export function storageMode(): StorageMode {
  if (redisUrl && redisToken) return "redis";
  return process.env.VERCEL ? "temporary" : "file";
}

const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
const PREFIX = "crayons-staff:";

function fileDir(): string {
  return process.env.VERCEL ? "/tmp/crayons-staff-data" : path.join(process.cwd(), ".data");
}
function filePath(key: string): string {
  return path.join(fileDir(), key.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".json");
}

export async function getJSON<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(PREFIX + key)) ?? null;
  try {
    return JSON.parse(await fs.readFile(filePath(key), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  if (redis) { await redis.set(PREFIX + key, value); return; }
  await fs.mkdir(fileDir(), { recursive: true });
  const tmp = filePath(key) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, filePath(key));
}
