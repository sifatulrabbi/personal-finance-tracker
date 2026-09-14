# Simply Finance

A shared household record of money held, money owed, income, expenses, and unpaid recurring bills.

## Language

**Wallet**: A named place where money is held or card debt is recorded. Physical cash, bank accounts, digital wallets, and cards are wallet types. Each wallet has one currency.

**Cash balance**: Money held in a non-credit wallet. A debit card accessing an existing bank account is not a second copy of that account's money.

**Card debt**: Money owed on a credit card. Purchases increase debt; repayments and refunds reduce it. Available credit is the credit limit minus the debt, not household cash.

**Transaction**: A recorded income, expense, transfer, opening balance, or balance adjustment that affects one or more wallets.

**Transfer**: A movement between wallets, including a credit-card repayment. The movement itself is neither income nor an expense.

**Balance adjustment**: A recorded difference that brings a wallet to a manually specified balance, with a reason. It does not erase prior activity.

**Revision**: A preserved version of a transaction, identifying who changed it and what the record contained at that time.

**Exchange rate**: The number of BDT corresponding to one USD. Each applicable transaction keeps its own rate, whether explicitly entered or copied from the default.

**Recurring bill**: A weekly, monthly, or yearly schedule with an expected amount and a payment wallet. It is a plan, not proof of payment.

**Occurrence**: One dated bill generated from a recurring schedule. It remains due until manually confirmed or explicitly skipped. Confirmation records an expense for the entered amount or, when omitted, the scheduled amount.

**Category**: A named, flat classification with an income or expense type. An income or expense has one category of the matching type. Others is the default within each type. Transfers and balance reconciliation records have no category.

**Monthly spending**: Actual, non-voided expenses dated within an Asia/Dhaka calendar month, expressed in BDT using each expense's saved conversion. Unpaid bills and transfers are not spending.

**Monthly target**: One household spending target in BDT for a calendar month, independent of other months. It is not a limit on recording expenses.

**Category share**: A category's spending divided by the month's total actual spending, expressed as a percentage. The monthly target is not the denominator.
