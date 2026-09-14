import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const temporary = await mkdtemp(join(tmpdir(), "simply-finance-e2e-"));
const env = { ...process.env, GOCACHE: "/tmp/simply-finance-go-cache" };
const build = Bun.spawn(
  ["go", "build", "-o", join(temporary, "simply-finance"), "./cmd/simply-finance"],
  { cwd: root, env, stdout: "inherit", stderr: "inherit" },
);
if ((await build.exited) !== 0) throw new Error("Backend build failed");
const binary = join(temporary, "simply-finance");
for (const command of ["migrate", "seed"]) {
  const setup = Bun.spawn([binary, command, "--database", join(temporary, "test.sqlite")], {
    cwd: root, env, stdout: "inherit", stderr: "inherit",
  });
  if ((await setup.exited) !== 0) throw new Error(`Database ${command} failed`);
}
const hash = Bun.spawn([binary, "hash-password"], {
  cwd: root,
  env,
  stdin: new Blob(["test-household-password"]),
  stdout: "pipe",
  stderr: "inherit",
});
const passwordHash = (await new Response(hash.stdout).text()).trim();
if ((await hash.exited) !== 0) throw new Error("Test password hashing failed");
const server = Bun.spawn([binary, "serve"], {
  cwd: root,
  env: {
    ...env,
    LISTEN_ADDR: "127.0.0.1:47833",
    DATABASE_PATH: join(temporary, "test.sqlite"),
    APP_ORIGIN: "http://127.0.0.1:47833",
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
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await server.exited;
  await rm(temporary, { recursive: true, force: true });
}
process.on("SIGTERM", () => {
  void stop();
});
process.on("SIGINT", () => {
  void stop();
});
await server.exited;
await stop();
