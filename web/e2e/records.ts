import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";
import { openSheet } from "./login";

// Helpers for the Add/Correct record sheet: kind as a segmented control, wallets and
// categories as radio chips, and a large amount field.

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A wallet chip's accessible name is its name, optionally followed by " · USD", " · Credit"
// or " · Archived".
export function walletRadio(scope: Locator, group: "Wallet" | "From wallet" | "To wallet", name: string) {
  return scope
    .getByRole("group", { name: group, exact: true })
    .getByRole("radio", { name: new RegExp(`^${escapeRegExp(name)}( · .*)?$`) });
}

export function categoryRadio(scope: Locator, name: string) {
  return scope.getByRole("group", { name: "Category", exact: true }).getByRole("radio", { name, exact: true });
}

export function kindRadio(scope: Locator, kind: "expense" | "income" | "transfer") {
  const label = { expense: "Expense", income: "Income", transfer: "Transfer" }[kind];
  return scope.getByRole("group", { name: "Record type", exact: true }).getByRole("radio", { name: label, exact: true });
}

// Presses "Load more records" from the keyboard. Clicking would first scroll the button into
// view, which also starts the infinite scroll, so the button could vanish before the click.
export async function loadMoreWithKeyboard(page: Page) {
  const button = page.getByRole("button", { name: "Load more records" });
  await button.evaluate((element: HTMLElement) => element.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
}

// Opens the Add record sheet from the tab bar (phones) or the sidebar (wide screens).
export async function openAddRecord(page: Page) {
  await page.getByRole("button", { name: "Add record", exact: true }).first().click();
  const sheet = await openSheet(page);
  await expect(sheet.getByLabel("Amount", { exact: true })).toBeVisible();
  return sheet;
}

// Types the amount key by key, the way a person enters it.
export async function typeAmount(sheet: Locator, amount: string) {
  const field = sheet.getByLabel("Amount", { exact: true });
  await field.click();
  await field.press("ControlOrMeta+a");
  await field.press("Backspace");
  await field.pressSequentially(amount);
}

export async function addRecord(
  page: Page,
  record: {
    kind?: "expense" | "income" | "transfer";
    wallet?: string;
    to?: string;
    amount: string;
    note?: string;
    category?: string;
    date?: string;
  },
) {
  const sheet = await openAddRecord(page);
  const kind = record.kind ?? "expense";
  await kindRadio(sheet, kind).check();
  await typeAmount(sheet, record.amount);
  if (record.wallet) await walletRadio(sheet, kind === "transfer" ? "From wallet" : "Wallet", record.wallet).check();
  if (record.to) await walletRadio(sheet, "To wallet", record.to).check();
  if (record.category) await categoryRadio(sheet, record.category).check();
  if (record.date) await sheet.getByLabel("Date", { exact: true }).fill(record.date);
  if (record.note) await sheet.getByLabel("Note", { exact: true }).fill(record.note);
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
