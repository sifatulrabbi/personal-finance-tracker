import type {
  AuditEvent,
  Bill,
  Category,
  CategoryInput,
  LoginInput,
  MonthlySpending,
  MonthlyTarget,
  MonthlyTargetUpdate,
  Page,
  PaymentInput,
  Schedule,
  ScheduleInput,
  ScheduleUpdate,
  Settings,
  SettingsUpdate,
  SkipInput,
  Transaction,
  TransactionCorrection,
  TransactionInput,
  TransactionVoid,
  User,
  Wallet,
  WalletAdjustment,
  WalletInput,
  WalletUpdate,
} from "./types";

// Every financial or settings write carries an idempotency key, reused only when retrying
// the exact same request.
export type WriteOptions = { key: string };

// The port the UI talks to. Production uses the fetch adapter (http.ts); unit tests pass a
// fake (fake.ts). The server owns every financial rule; this is transport only.
export interface ApiClient {
  me(): Promise<User>;
  login(input: LoginInput): Promise<User>;
  logout(): Promise<void>;

  wallets(): Promise<Wallet[]>;
  createWallet(input: WalletInput, options: WriteOptions): Promise<Wallet>;
  updateWallet(input: WalletUpdate, options: WriteOptions): Promise<Wallet>;
  adjustWallet(id: string, input: WalletAdjustment, options: WriteOptions): Promise<Transaction>;

  transactions(page: Page): Promise<Transaction[]>;
  createTransaction(input: TransactionInput, options: WriteOptions): Promise<Transaction>;
  correctTransaction(id: string, input: TransactionCorrection, options: WriteOptions): Promise<Transaction>;
  voidTransaction(id: string, input: TransactionVoid, options: WriteOptions): Promise<Transaction>;
  history(id: string): Promise<Transaction[]>;

  categories(): Promise<Category[]>;
  createCategory(input: CategoryInput, options: WriteOptions): Promise<Category>;

  settings(): Promise<Settings>;
  updateSettings(input: SettingsUpdate, options: WriteOptions): Promise<Settings>;

  monthly(month: string): Promise<MonthlySpending>;
  setMonthlyTarget(month: string, input: MonthlyTargetUpdate, options: WriteOptions): Promise<MonthlyTarget>;

  schedules(): Promise<Schedule[]>;
  createSchedule(input: ScheduleInput, options: WriteOptions): Promise<Schedule>;
  updateSchedule(input: ScheduleUpdate, options: WriteOptions): Promise<Schedule>;
  dueBills(): Promise<Bill[]>;
  confirmBill(id: string, input: PaymentInput, options: WriteOptions): Promise<Transaction>;
  skipBill(id: string, input: SkipInput, options: WriteOptions): Promise<Bill>;

  audit(page: Page): Promise<AuditEvent[]>;
}
