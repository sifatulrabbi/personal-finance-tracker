# Preserve balance effects and historical exchange rates

Wallet entries are the source of truth for balances; opening balances and manual adjustments are recorded transactions rather than silent balance overwrites. Corrections preserve prior revisions and atomically reverse the previous effects before applying replacement effects, so balances remain explainable without treating edits as new spending.

Money uses integer minor units and rates use fixed-precision decimals. Each applicable transaction snapshots its BDT-per-USD rate because changing the system default must not rewrite historical values. Credit-card purchases create debt, while repayments move money from a cash wallet to reduce that debt without recording a second expense.
