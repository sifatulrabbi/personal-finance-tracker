// One place for the e2e ports so parallel worktrees can pick their own with E2E_PORT.
export const appPort = Number(process.env.E2E_PORT ?? 47833);
// The control server resets the database between tests. It listens next to the app.
export const controlPort = Number(process.env.E2E_CONTROL_PORT ?? appPort + 1);
export const appOrigin = `http://127.0.0.1:${appPort}`;
export const controlOrigin = `http://127.0.0.1:${controlPort}`;
