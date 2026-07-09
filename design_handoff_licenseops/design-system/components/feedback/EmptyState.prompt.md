**EmptyState** — centered zero-data / all-clear message inside a card or table.

```jsx
<EmptyState tone="ok" icon={<CheckIcon/>}
  title="No open drift alerts"
  description="The ledger matches tenant consumption. Last run 06:00." />
```

`ok` tone for resolved/all-clear (drift cleared, my-queue empty); `neutral` for filtered no-results. Add an `action` only when there's a sensible next step.
