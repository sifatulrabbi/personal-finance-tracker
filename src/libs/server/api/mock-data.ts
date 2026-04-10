import { createId } from "@/libs/id";

const MOCK_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000101";
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000102";
const NOW = "2026-04-08T12:00:00.000Z";

// ── People ──────────────────────────────────────────────────────────────────

const defaultPersonId = "00000000-0000-4000-8000-000000000103";
const personSifatulId = createId();
const personNusratId = createId();

export type MockPerson = Readonly<{
  id: string;
  householdId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export const mockPeople: MockPerson[] = [
  {
    id: defaultPersonId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Household",
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: personSifatulId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Sifatul",
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: personNusratId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Nusrat",
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

// ── Users ───────────────────────────────────────────────────────────────────

export type MockUser = Readonly<{
  id: string;
  householdId: string;
  email: string;
  name: string | null;
  isDrafted: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export const mockUsers: MockUser[] = [
  {
    id: MOCK_USER_ID,
    householdId: MOCK_HOUSEHOLD_ID,
    email: "mdsifatulislam.rabbi@gmail.com",
    name: "Sifatul Rabbi",
    isDrafted: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    email: "invited@example.com",
    name: null,
    isDrafted: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

// ── Accounts ────────────────────────────────────────────────────────────────

const accountWalletId = createId();
const accountSavingsId = createId();
const accountCreditId = createId();

export type MockAccount = Readonly<{
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  initialBalanceMinor: number;
  currentBalanceMinor: number;
  createdAt: string;
  updatedAt: string;
}>;

export const mockAccounts: MockAccount[] = [
  {
    id: accountWalletId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Main Wallet",
    description: "Day-to-day spending",
    initialBalanceMinor: 50000,
    currentBalanceMinor: 42350,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: accountSavingsId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Savings",
    description: "Emergency fund",
    initialBalanceMinor: 150000,
    currentBalanceMinor: 165000,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: accountCreditId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Credit Card",
    description: null,
    initialBalanceMinor: 0,
    currentBalanceMinor: -5000,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

// ── Categories ──────────────────────────────────────────────────────────────

const categoryGroceriesId = createId();
const categoryRentId = createId();
const categoryUtilitiesId = createId();
const categoryTransportId = createId();
const categoryEntertainmentId = createId();

export type MockCategory = Readonly<{
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export const mockCategories: MockCategory[] = [
  {
    id: categoryGroceriesId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Groceries",
    description: "Food and household supplies",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: categoryRentId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Rent",
    description: "Monthly apartment rent",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: categoryUtilitiesId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Utilities",
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: categoryTransportId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Transportation",
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: categoryEntertainmentId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Entertainment",
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

// ── Origins ─────────────────────────────────────────────────────────────────

const originAcmeId = createId();
const originFreelanceId = createId();
const originSideProjectId = createId();

export type MockOrigin = Readonly<{
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export const mockOrigins: MockOrigin[] = [
  {
    id: originAcmeId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Acme Corp",
    description: "Primary employer",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: originFreelanceId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Freelance",
    description: "Freelance clients",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: originSideProjectId,
    householdId: MOCK_HOUSEHOLD_ID,
    name: "Side Project",
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

// ── Transactions ────────────────────────────────────────────────────────────

const transferGroupId = createId();

export type MockTransaction = Readonly<{
  id: string;
  householdId: string;
  accountId: string;
  personId: string;
  categoryId: string | null;
  originId: string | null;
  createdByUserId: string;
  type: "income" | "expense";
  amountMinor: number;
  description: string | null;
  transactionDate: string;
  transferGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; name: string };
  person: { id: string; name: string };
  category: { id: string; name: string } | null;
  origin: { id: string; name: string } | null;
}>;

export const mockTransactions: MockTransaction[] = [
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    accountId: accountWalletId,
    personId: defaultPersonId,
    categoryId: categoryGroceriesId,
    originId: null,
    createdByUserId: MOCK_USER_ID,
    type: "expense",
    amountMinor: 3250,
    description: "Weekly groceries",
    transactionDate: "2026-04-07",
    transferGroupId: null,
    createdAt: NOW,
    updatedAt: NOW,
    account: { id: accountWalletId, name: "Main Wallet" },
    person: { id: defaultPersonId, name: "Household" },
    category: { id: categoryGroceriesId, name: "Groceries" },
    origin: null,
  },
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    accountId: accountWalletId,
    personId: personSifatulId,
    categoryId: categoryTransportId,
    originId: null,
    createdByUserId: MOCK_USER_ID,
    type: "expense",
    amountMinor: 1500,
    description: "Bus pass",
    transactionDate: "2026-04-06",
    transferGroupId: null,
    createdAt: NOW,
    updatedAt: NOW,
    account: { id: accountWalletId, name: "Main Wallet" },
    person: { id: personSifatulId, name: "Sifatul" },
    category: { id: categoryTransportId, name: "Transportation" },
    origin: null,
  },
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    accountId: accountSavingsId,
    personId: personSifatulId,
    categoryId: categoryRentId,
    originId: originAcmeId,
    createdByUserId: MOCK_USER_ID,
    type: "income",
    amountMinor: 250000,
    description: "April salary",
    transactionDate: "2026-04-01",
    transferGroupId: null,
    createdAt: NOW,
    updatedAt: NOW,
    account: { id: accountSavingsId, name: "Savings" },
    person: { id: personSifatulId, name: "Sifatul" },
    category: { id: categoryRentId, name: "Rent" },
    origin: { id: originAcmeId, name: "Acme Corp" },
  },
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    accountId: accountWalletId,
    personId: personNusratId,
    categoryId: categoryEntertainmentId,
    originId: null,
    createdByUserId: MOCK_USER_ID,
    type: "expense",
    amountMinor: 2900,
    description: "Movie tickets",
    transactionDate: "2026-04-05",
    transferGroupId: null,
    createdAt: NOW,
    updatedAt: NOW,
    account: { id: accountWalletId, name: "Main Wallet" },
    person: { id: personNusratId, name: "Nusrat" },
    category: { id: categoryEntertainmentId, name: "Entertainment" },
    origin: null,
  },
  // Transfer pair: savings → wallet
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    accountId: accountSavingsId,
    personId: personSifatulId,
    categoryId: null,
    originId: null,
    createdByUserId: MOCK_USER_ID,
    type: "expense",
    amountMinor: 10000,
    description: "Transfer to wallet",
    transactionDate: "2026-04-03",
    transferGroupId,
    createdAt: NOW,
    updatedAt: NOW,
    account: { id: accountSavingsId, name: "Savings" },
    person: { id: personSifatulId, name: "Sifatul" },
    category: null,
    origin: null,
  },
  {
    id: createId(),
    householdId: MOCK_HOUSEHOLD_ID,
    accountId: accountWalletId,
    personId: personSifatulId,
    categoryId: null,
    originId: null,
    createdByUserId: MOCK_USER_ID,
    type: "income",
    amountMinor: 10000,
    description: "Transfer from savings",
    transactionDate: "2026-04-03",
    transferGroupId,
    createdAt: NOW,
    updatedAt: NOW,
    account: { id: accountWalletId, name: "Main Wallet" },
    person: { id: personSifatulId, name: "Sifatul" },
    category: null,
    origin: null,
  },
];
