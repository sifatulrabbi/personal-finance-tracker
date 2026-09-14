# Recurring schedules create due items, not automatic expenses

Weekly, monthly, and yearly schedules create dated occurrences that require manual payment confirmation because a due date does not prove money moved. Confirmation uses the scheduled amount only when the actual amount is omitted; users enter any charges in the final amount and explain them in a note, with no percentage calculator, notifications, or automatic completion.

Occurrence identity must prevent duplicate generation and duplicate payment on retries or concurrent requests. Calendar generation uses Asia/Dhaka and retains the original day anchor when clamping dates to shorter months, preventing a January 31 schedule from permanently drifting to the 28th.
