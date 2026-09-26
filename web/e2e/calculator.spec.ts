import type { Locator, Page } from "@playwright/test";
import { apiWrite, dhakaToday, expect, test } from "./fixtures";
import { editTarget, navigate, signIn, toast } from "./login";
import { openAddRecord, typeAmount } from "./records";

// The calculator amount input (ADR 0014): every amount field takes a calculation, shows its
// result, and records keep the calculation. Both projects are touch phones, so the operator
// keys are part of every run.

async function signedIn(page: Page, path = "/activity") {
  await page.goto(path);
  await signIn(page);
}

async function cashWallet(page: Page) {
  const cash = await apiWrite(page, "/wallets", { name: "Cash", type: "physical", opening_balance: "10000" });
  await page.reload();
  return cash as { id: string };
}

const preview = (scope: Locator) => scope.locator('[data-slot="calc-preview"]');
const row = (page: Page, text: string) => page.getByTestId("activity-row").filter({ hasText: text });

test("a calculation saves its result and the record shows how it was calculated", async ({ page }) => {
  await signedIn(page);
  await cashWallet(page);
  const sheet = await openAddRecord(page);
  await typeAmount(sheet, "120+45.50+300*2");
  await expect(preview(sheet)).toHaveText("= ৳765.50");
  await sheet.getByLabel("Note", { exact: true }).fill("Market run");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Market run")).toContainText("−৳765.50");

  await row(page, "Market run").click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByTestId("record-amount")).toHaveText("−৳765.50");
  await expect(detail.getByTestId("record-formula")).toHaveText("Calculated from 120 + 45.50 + 300 × 2");
  await expect(detail.getByTestId("history-entry").first().getByTestId("history-formula")).toHaveText(
    "Calculated from 120 + 45.50 + 300 × 2",
  );

  // A correction starts from the calculation; fixing one term recalculates the amount.
  await detail.getByRole("button", { name: "Correct record" }).click();
  const amount = detail.getByLabel("Amount", { exact: true });
  await expect(amount).toHaveValue("120 + 45.50 + 300 × 2");
  await typeAmount(detail, "120+45.50+300×3");
  await expect(preview(detail)).toHaveText("= ৳1,065.50");
  await detail.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toast(page, "Correction saved")).toBeVisible();
  await expect(row(page, "Market run")).toContainText("−৳1,065.50");
  await row(page, "Market run").click();
  const entries = page.getByRole("dialog").getByTestId("history-entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0).getByTestId("history-formula")).toHaveText("Calculated from 120 + 45.50 + 300 × 3");
  await expect(entries.nth(1).getByTestId("history-formula")).toHaveText("Calculated from 120 + 45.50 + 300 × 2");
});

test("operator keys show on touch while the amount is focused and type at the caret", async ({ page }) => {
  await signedIn(page);
  await cashWallet(page);
  const sheet = await openAddRecord(page);
  const amount = sheet.getByLabel("Amount", { exact: true });
  const keys = sheet.getByRole("group", { name: "Calculator keys" });
  await expect(keys).toHaveCount(0);
  await amount.tap();
  await expect(keys).toBeVisible();
  await amount.pressSequentially("12045");
  // Put the caret between "120" and "45", then tap +: the key types there, not at the end.
  await amount.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 3));
  await keys.getByRole("button", { name: "Plus" }).tap();
  await expect(amount).toHaveValue("120+45");
  // Focus (and so the phone keyboard) stays in the field.
  await expect(amount).toBeFocused();
  await amount.evaluate((input: HTMLInputElement) => input.setSelectionRange(6, 6));
  await keys.getByRole("button", { name: "Times" }).tap();
  await amount.press("2");
  await expect(amount).toHaveValue("120+45×2");
  await expect(preview(sheet)).toHaveText("= ৳210.00");
  await keys.getByRole("button", { name: "Delete" }).tap();
  await expect(amount).toHaveValue("120+45×");
  await expect(amount).toBeFocused();
  await keys.getByRole("button", { name: "Open bracket" }).tap();
  await amount.press("3");
  await keys.getByRole("button", { name: "Minus" }).tap();
  await amount.press("1");
  await keys.getByRole("button", { name: "Close bracket" }).tap();
  await expect(amount).toHaveValue("120+45×(3−1)");
  await expect(preview(sheet)).toHaveText("= ৳210.00");
  // Leaving the field hides the keys.
  await sheet.getByLabel("Note", { exact: true }).tap();
  await expect(keys).toHaveCount(0);
});

test("an invalid calculation blocks save with an error at the amount", async ({ page }) => {
  await signedIn(page);
  await cashWallet(page);
  const sheet = await openAddRecord(page);
  let posted = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/transactions")) posted++;
  });
  await typeAmount(sheet, "120+");
  await expect(preview(sheet)).toHaveText("");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  const field = sheet.locator('[data-field="amount"]');
  await expect(field).toContainText("an operator or bracket is missing or extra");
  await expect(sheet.getByLabel("Amount", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await typeAmount(sheet, "2^3");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(field).toContainText("Use only numbers, + − × ÷ and brackets.");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(posted).toBe(0);
});

test("the server refuses a formula that does not equal the amount", async ({ page }) => {
  await signedIn(page);
  const cash = await cashWallet(page);
  const response = await page.request.post("/api/v1/transactions", {
    headers: { "X-CSRF-Protection": "1", "Idempotency-Key": crypto.randomUUID() },
    data: { kind: "expense", wallet_id: cash.id, amount: "765.51", amount_formula: "120+45.50+300*2", date: dhakaToday(), note: "" },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatchObject({ code: "validation_failed", field: "amount_formula" });
});

test("a calculation in the monthly target saves only its result", async ({ page }) => {
  await signedIn(page, "/");
  await navigate(page, "Monthly spending");
  await editTarget(page);
  const target = page.getByLabel("Monthly target (BDT)");
  await target.fill("2,000*2+500");
  await expect(preview(page.locator("form"))).toHaveText("= ৳4,500.00");
  await page.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(toast(page, "Target saved")).toBeVisible();
  await expect(page.getByTestId("monthly-target")).toHaveText("৳4,500.00");
  const monthly = await (await page.request.get("/api/v1/monthly")).json();
  expect(monthly.target.amount).toBe("4500.00");
  await editTarget(page);
  await expect(target).toHaveValue("4500.00");
});
