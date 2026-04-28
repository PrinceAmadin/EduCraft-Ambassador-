// api/_redis.ts — shared Redis client factory
// Every API file imports getClient() and MUST call client.disconnect() when done.

import { createClient } from "redis";

export type RedisClient = ReturnType<typeof createClient>;

export async function getClient(): Promise<RedisClient> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL environment variable is not set.");
  const client = createClient({ url });
  client.on("error", () => { /* suppress connection noise */ });
  await client.connect();
  return client;
}
