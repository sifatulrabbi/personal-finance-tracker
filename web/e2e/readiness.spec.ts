import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./login";

async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
test("archived wallets are never silently replaced in transfers or bills", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  async function write(path: string, data: unknown, method = "POST") {
    const response = await page.request.fetch(`/api/v1${path}`, {
      method,
      headers: {
        "X-CSRF-Protection": "1",
        "Idempotency-Key": crypto.randomUUID(),
      },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const source = await write("/wallets", {
    name: `Source ${info.project.name}`,
    type: "physical",
    opening_balance: "1000",
  });
  const destination = await write("/wallets", {
    name: `Archived destination ${info.project.name}`,
    type: "physical",
  });
  const other = await write("/wallets", {
    name: `Replacement ${info.project.name}`,
    type: "physical",
  });
  const note = `Archived transfer ${info.project.name}`;
  const transaction = await write("/transactions", {
    kind: "transfer",
    wallet_id: source.id,
    to_wallet_id: destination.id,
    amount: "100",
    date: "2026-09-14",
    note,
  });
  const billName = `Archived bill ${info.project.name}`;
  await write("/schedules", {
    name: billName,
    wallet_id: destination.id,
    amount: "10",
    frequency: "yearly",
    start_date: "2026-09-14",
  });
  const wallets = await (await page.request.get("/api/v1/wallets")).json();
  const current = wallets.find((w: { id: string }) => w.id === destination.id);
  await write(
    `/wallets/${destination.id}`,
    { ...current, archived: true },
    "PUT",
  );
  await page.reload();
  await page.getByText(note, { exact: true }).click();
  await page.getByRole("button", { name: "Correct record" }).click();
  await expect(page.getByLabel("To wallet", { exact: true })).toHaveValue(
    destination.id,
  );
  await expect(
    page.getByRole("button", { name: "Save correction" }),
  ).toBeDisabled();
  await page.getByLabel("To wallet", { exact: true }).selectOption(other.id);
  await page
    .getByLabel("Reason for correction")
    .fill("Explicitly move to replacement");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const history = await (
    await page.request.get(`/api/v1/transactions/${transaction.id}/history`)
  ).json();
  expect(history[0].to_wallet_id).toBe(destination.id);
  expect(history[1].to_wallet_id).toBe(other.id);
  await navigate(page, "Bills");
  await page
    .getByRole("button", { name: `Edit ${billName}`, exact: true })
    .click();
  await expect(page.getByLabel("Wallet", { exact: true })).toHaveValue(
    destination.id,
  );
  await expect(
    page.getByRole("button", { name: "Save bill", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("article", { name: `Due ${billName}` })
    .getByRole("button", { name: "Confirm payment" })
    .click();
  await expect(page.getByLabel("Pay from")).toHaveValue(destination.id);
  await expect(
    page.getByRole("button", { name: "Record payment" }),
  ).toBeDisabled();
});

test("saved messages disappear when rate or target has unsaved edits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await navigate(page, "Settings");
  const rate = page.getByLabel("Default exchange rate (BDT per USD)");
  await rate.fill("125");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  await rate.fill("126");
  await expect(page.getByRole("status")).toHaveCount(0);
  await navigate(page, "Monthly spending");
  const target = page.getByLabel("Monthly target (BDT)");
  await target.fill("4000");
  await page.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Target saved");
  await target.fill("5000");
  await expect(page.getByRole("status")).toHaveCount(0);
});
