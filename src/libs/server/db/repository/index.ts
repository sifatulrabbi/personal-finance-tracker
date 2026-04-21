import type { BunSqlDatabase } from "@/libs/server/db/client";

import {
  createAccountsRepository,
  type AccountsRepository,
} from "@/libs/server/db/repository/accounts-repository";
import {
  createCategoriesRepository,
  type CategoriesRepository,
} from "@/libs/server/db/repository/categories-repository";
import {
  createCurrenciesRepository,
  type CurrenciesRepository,
} from "@/libs/server/db/repository/currencies-repository";
import {
  createOriginsRepository,
  type OriginsRepository,
} from "@/libs/server/db/repository/origins-repository";
import {
  createPeopleRepository,
  type PeopleRepository,
} from "@/libs/server/db/repository/people-repository";
import {
  createTransactionsRepository,
  type TransactionsRepository,
  type TransactionFilters,
  type InsertExpenseCommand,
  type InsertIncomeCommand,
  type InsertTransferCommand,
  type UpdateTransactionCommand,
} from "@/libs/server/db/repository/transactions-repository";
import {
  createUsersRepository,
  type UsersRepository,
  type UserRow,
} from "@/libs/server/db/repository/users-repository";
import { type RepositoryContext } from "@/libs/server/db/repository/types";

/**
 * Builds the full repository bundle bound to a single database handle. Route
 * handlers use this for the common case; inside a `db.begin(...)` callback,
 * call it again with the transaction handle so all repositories share the
 * same transaction:
 *
 *   await db.begin(async (tx) => {
 *     const repos = createRepositories({ db: tx });
 *     await repos.transactions.insertExpense(...);
 *   });
 */
export function createRepositories(ctx: { db: BunSqlDatabase }): Repositories {
  const accounts = createAccountsRepository(ctx);
  const categories = createCategoriesRepository(ctx);
  const currencies = createCurrenciesRepository(ctx);
  const origins = createOriginsRepository(ctx);
  const people = createPeopleRepository(ctx);
  const users = createUsersRepository(ctx);
  const transactions = createTransactionsRepository({
    ...ctx,
    accountsRepository: accounts,
  });

  return {
    accounts,
    categories,
    currencies,
    origins,
    people,
    transactions,
    users,
  };
}

export type Repositories = Readonly<{
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  currencies: CurrenciesRepository;
  origins: OriginsRepository;
  people: PeopleRepository;
  transactions: TransactionsRepository;
  users: UsersRepository;
}>;

export {
  createAccountsRepository,
  createCategoriesRepository,
  createCurrenciesRepository,
  createOriginsRepository,
  createPeopleRepository,
  createTransactionsRepository,
  createUsersRepository,
};

export type {
  AccountsRepository,
  CategoriesRepository,
  CurrenciesRepository,
  OriginsRepository,
  PeopleRepository,
  TransactionsRepository,
  TransactionFilters,
  InsertExpenseCommand,
  InsertIncomeCommand,
  InsertTransferCommand,
  UpdateTransactionCommand,
  UsersRepository,
  UserRow,
  RepositoryContext,
};
