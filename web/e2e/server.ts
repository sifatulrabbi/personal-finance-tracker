import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { appOrigin, appPort, controlPort } from "./ports";

// Runs the real Go binary against a temporary SQLite database. A small control server
// (POST /reset) swaps in a fresh copy of the migrated and seeded template database and
// restarts the backend, so every test starts from the same known state.
const root = resolve(import.meta.dir, "../..");
const temporary = await mkdtemp(join(tmpdir(), "simply-finance-e2e-"));
const env = { ...process.env, GOCACHE: "/tmp/simply-finance-go-cache" };
const binary = join(temporary, "simply-finance");
const template = join(temporary, "template.sqlite");
const database = join(temporary, "test.sqlite");

async function run(command: string[], stdin?: Blob) {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdin: stdin ?? "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) throw new Error(`${command.join(" ")} failed`);
  return output;
}

await run(["go", "build", "-o", binary, "./cmd/simply-finance"]);
// Migration and seeding are explicit operator commands, run once into a template database.
for (const command of ["migrate", "seed"])
  await run([binary, command, "--database", template]);
const passwordHash = (
  await run([binary, "hash-password"], new Blob(["test-household-password"]))
).trim();

let server: Subprocess | undefined;
let stopping = false;

async function stopBackend() {
  if (!server) return;
  const current = server;
  server = undefined;
  current.kill("SIGTERM");
  await current.exited;
}

async function waitUntilHealthy() {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const response = await fetch(`${appOrigin}/healthz`);
      if (response.ok) return;
    } catch {
      // The backend is still starting.
    }
    await Bun.sleep(25);
  }
  throw new Error("Backend did not become healthy");
}

async function startFresh() {
  await stopBackend();
  for (const suffix of ["", "-wal", "-shm"])
    await rm(`${database}${suffix}`, { force: true });
  await copyFile(template, database);
  server = Bun.spawn([binary, "serve"], {
    cwd: root,
    env: {
      ...env,
      LISTEN_ADDR: `127.0.0.1:${appPort}`,
      DATABASE_PATH: database,
      APP_ORIGIN: appOrigin,
      ALLOW_INSECURE_COOKIES: "true",
      AUTH_USERS_JSON: JSON.stringify([
        {
          email: "test@example.test",
          password_hash: passwordHash,
          name: "Test household",
        },
      ]),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  await waitUntilHealthy();
}

// Resets are serialized so two overlapping requests never race on the database file.
let queue: Promise<void> = Promise.resolve();
function reset() {
  queue = queue.then(startFresh, startFresh);
  return queue;
}

await reset();
const control = Bun.serve({
  hostname: "127.0.0.1",
  port: controlPort,
  async fetch(request) {
    if (request.method === "POST" && new URL(request.url).pathname === "/reset") {
      await reset();
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  },
});

async function stop() {
  if (stopping) return;
  stopping = true;
  control.stop(true);
  await stopBackend();
  await rm(temporary, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
