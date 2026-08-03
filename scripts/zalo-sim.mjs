#!/usr/bin/env node
/**
 * Simulate an inbound Zalo OA message against a locally running dev server.
 *
 * Signs a `user_send_text` payload exactly as Zalo does and POSTs it at the
 * channel webhook, so the whole real pipeline runs — signature verification,
 * workspace resolution, session creation, the agent, Cal.com booking. Only the
 * outbound send is stubbed, via ZALO_DRY_RUN.
 *
 *   node scripts/zalo-sim.mjs --text "cho mình đặt lịch mai 3h chiều"
 *   node scripts/zalo-sim.mjs --oa oa_dev_local --user guest_1 --text "..."
 */
import { createHash } from "node:crypto";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const target = arg("url", "http://127.0.0.1:2000/zalo/webhook");

// This tool forges a signature. It must never be pointed at a deployed app.
const host = new URL(target).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to run against a non-local host: ${host}`);
  process.exit(1);
}

const appId = process.env.ZALO_APP_ID?.trim();
const oaSecret = process.env.ZALO_OA_SECRET_KEY?.trim();
if (!appId || !oaSecret) {
  console.error("Set ZALO_APP_ID and ZALO_OA_SECRET_KEY in your environment first.");
  process.exit(1);
}

const oaId = arg("oa", "oa_dev_local");
const userId = arg("user", "sim_user_1");
const text = arg("text", "cho mình đặt lịch mai 3h chiều");
const timestamp = String(Date.now());

const payload = {
  app_id: appId,
  oa_id: oaId,
  timestamp,
  event_name: "user_send_text",
  sender: { id: userId },
  recipient: { id: oaId },
  message: { text, msg_id: `sim_${timestamp}` },
};

const raw = JSON.stringify(payload);
const mac = createHash("sha256").update(appId + raw + timestamp + oaSecret).digest("hex");

const res = await fetch(target, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-ZEvent-Signature": `mac=${mac}`,
  },
  body: raw,
});

console.log(`${res.status} ${res.statusText}`);
console.log(await res.text());
console.log(
  "\nThe agent replies asynchronously — watch the dev server log for [zalo:dry-run] lines,\nor open the conversation in /dashboard.",
);

