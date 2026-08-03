#!/usr/bin/env node
/**
 * One-shot: re-encrypt Pilot Zalo seed token with WORKSPACE_SECRETS_KEY from .env.local.
 * Seed.sql ciphertext assumes the vitest key; local env often differs.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const { upsertChannelConnection } = await import("../lib/channel-connections.ts");

await upsertChannelConnection({
  workspaceId: "00000000-0000-4000-8000-000000000001",
  provider: "zalo",
  externalId: "oa_dev_local",
  displayName: "Dev Local OA",
  accessToken: "dry-run-local-token",
  refreshToken: "dry-run-refresh",
  expiresAt: new Date(Date.now() + 3650 * 864e5).toISOString(),
});

console.log("ok: Pilot Zalo connection upserted with local-key ciphertext");
