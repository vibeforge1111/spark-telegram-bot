import { readFileSync } from "node:fs";

const role = readArg("--role") || process.env.SPARK_DEPLOY_ROLE || "bot";

const checks = [];
loadEnvFile(readArg("--env-file"));

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function loadEnvFile(filePath) {
  if (!filePath) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = stripEnvQuotes(rawValue.trim());
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function env(name) {
  return (process.env[name] || "").trim();
}

function looksPlaceholder(value) {
  return /<[^>]+>|your[_-]|changeme|replace[_-]?me|example\.com|private-non-guessable/i.test(value);
}

function ok(name, detail) {
  checks.push({ status: "ok", name, detail });
}

function warn(name, detail) {
  checks.push({ status: "warn", name, detail });
}

function fail(name, detail) {
  checks.push({ status: "fail", name, detail });
}

function requireEnv(name, detail = "required") {
  const value = env(name);
  if (!value) {
    fail(name, "missing");
    return;
  }
  if (looksPlaceholder(value)) {
    fail(name, "replace placeholder value");
    return;
  }
  ok(name, detail);
}

function requireSecret(name, minLength = 24) {
  const value = env(name);
  if (!value) {
    fail(name, "missing");
    return;
  }
  if (looksPlaceholder(value)) {
    fail(name, "replace placeholder value");
    return;
  }
  if (value.length < minLength) {
    fail(name, `too short; use ${minLength}+ characters`);
    return;
  }
  ok(name, "present");
}

function requireDataPath(name, detail) {
  const value = env(name);
  if (!value) {
    fail(name, "missing");
    return;
  }
  if (looksPlaceholder(value)) {
    fail(name, "replace placeholder value");
    return;
  }
  if (value !== "/data" && !value.startsWith("/data/")) {
    fail(name, "must live under the persistent /data volume");
    return;
  }
  ok(name, detail);
}

function isPrivateRailwayUrl(value) {
  return /\.railway\.internal(?::\d+)?(?:\/|$)/.test(value);
}

function hasExplicitPort(value) {
  try {
    return Boolean(new URL(value).port);
  } catch {
    return false;
  }
}

function checkInternalUrl(name) {
  const value = env(name);
  if (!value) {
    fail(name, "missing");
    return;
  }
  if (looksPlaceholder(value)) {
    fail(name, "replace placeholder value");
    return;
  }
  if (isPrivateRailwayUrl(value) && !hasExplicitPort(value)) {
    fail(name, "Railway private DNS needs an explicit port");
    return;
  }
  ok(name, isPrivateRailwayUrl(value) ? "private Railway URL" : "public/local URL");
}

function checkPublicUrl(name) {
  const value = env(name);
  if (!value) {
    fail(name, "missing");
    return;
  }
  if (looksPlaceholder(value)) {
    fail(name, "replace placeholder value");
    return;
  }
  if (!isHttpsUrl(value)) {
    fail(name, "public URL must use https");
    return;
  }
  if (isPrivateRailwayUrl(value)) {
    fail(name, "public URL cannot use railway.internal");
    return;
  }
  ok(name, "public URL");
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function checkSpawner() {
  const host = env("HOST");
  if (!host) {
    warn("HOST", "set to 0.0.0.0 or :: for hosted deploys");
  } else if (host === "127.0.0.1" || host === "localhost") {
    fail("HOST", "loopback is not reachable by Railway/VPS ingress");
  } else {
    ok("HOST", host);
  }

  if (env("SPARK_HOSTED_PRIVATE_PREVIEW") === "1") {
    ok("SPARK_HOSTED_PRIVATE_PREVIEW", "enabled");
  } else {
    fail("SPARK_HOSTED_PRIVATE_PREVIEW", "set to 1 for hosted Railway/VPS Spawner");
  }

  requireEnv("SPARK_WORKSPACE_ID", "private workspace slug");
  requireSecret("SPARK_UI_API_KEY", 24);
  requireSecret("SPARK_BRIDGE_API_KEY", 24);
  requireSecret("TELEGRAM_RELAY_SECRET", 24);
  requireDataPath("SPARK_WORKSPACE_ROOT", "persistent workspace path");
  requireDataPath("SPAWNER_STATE_DIR", "persistent state path");
  requireEnv("MISSION_CONTROL_WEBHOOK_URLS", "bot relay callback URL");

  const webhook = env("MISSION_CONTROL_WEBHOOK_URLS");
  if (webhook && !webhook.includes("/spawner-events")) {
    fail("MISSION_CONTROL_WEBHOOK_URLS", "must point to the bot /spawner-events endpoint");
  } else if (webhook && isPrivateRailwayUrl(webhook) && !hasExplicitPort(webhook)) {
    fail("MISSION_CONTROL_WEBHOOK_URLS", "Railway private DNS needs an explicit bot port");
  } else if (webhook && !isPrivateRailwayUrl(webhook)) {
    warn("MISSION_CONTROL_WEBHOOK_URLS", "public/local URL works, but private service URL is preferred for hosted deploys");
  }

  if (env("SPARK_PRO_CONNECTION_TOKEN") || env("SPARK_PRO_BEARER_TOKEN")) {
    warn("SPARK_PRO_* token", "not part of the current Railway/VPS deploy flow; remove unless running a compatibility smoke");
  }
}

function checkBot() {
  requireEnv("BOT_TOKEN", "Telegram BotFather token");
  requireEnv("ADMIN_TELEGRAM_IDS", "comma-separated admin Telegram IDs");
  requireSecret("TELEGRAM_RELAY_SECRET", 24);
  requireSecret("SPARK_BRIDGE_API_KEY", 24);
  requireSecret("SPARK_UI_API_KEY", 24);
  requireDataPath("SPARK_GATEWAY_STATE_DIR", "persistent gateway state path");
  checkInternalUrl("TELEGRAM_RELAY_URL");
  checkInternalUrl("SPAWNER_UI_URL");

  if (isPrivateRailwayUrl(env("SPAWNER_UI_URL"))) {
    checkPublicUrl("SPAWNER_UI_PUBLIC_URL");
  }

  const host = env("TELEGRAM_RELAY_HOST");
  if (!host) {
    fail("TELEGRAM_RELAY_HOST", "set to :: or 0.0.0.0 on hosted deploys");
  } else if (host === "127.0.0.1" || host === "localhost") {
    fail("TELEGRAM_RELAY_HOST", "loopback is not reachable by the Spawner service");
  } else {
    ok("TELEGRAM_RELAY_HOST", host);
  }

  if (env("SPARK_MISSION_LLM_PROVIDER") === "anthropic") {
    fail("SPARK_MISSION_LLM_PROVIDER", "use claude, not anthropic");
  }

  if (env("SPARK_PRO_CONNECTION_TOKEN") || env("SPARK_PRO_BEARER_TOKEN")) {
    warn("SPARK_PRO_* token", "not part of the current Railway/VPS deploy flow; remove unless running a compatibility smoke");
  }
}

if (role === "spawner") {
  checkSpawner();
} else if (role === "bot") {
  checkBot();
} else {
  fail("role", "use --role spawner or --role bot");
}

for (const check of checks) {
  const label = check.status.toUpperCase().padEnd(4);
  console.log(`${label} ${check.name}: ${check.detail}`);
}

const failed = checks.filter((check) => check.status === "fail");
const warned = checks.filter((check) => check.status === "warn");
console.log(`\nSpark deploy doctor: ${failed.length} failed, ${warned.length} warned, ${checks.length} checked.`);
process.exitCode = failed.length ? 1 : 0;
