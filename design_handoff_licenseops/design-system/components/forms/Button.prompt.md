**Button** — the console's action control; one accent `primary` per view, `secondary`/`ghost` for the rest.

```jsx
<Button variant="primary" onClick={assign}>Assign now</Button>
<Button variant="secondary" icon={<RefreshIcon/>}>Run reconciliation</Button>
<Button variant="ghost" size="sm">Cancel</Button>
```

Variants: `primary` (Ricoh red), `secondary` (bordered card), `ghost` (transparent), `danger` (soft red). Sizes `sm`/`md`/`lg` map to 28/34/36px heights. Pass `disabled` for gated actions (e.g. Assign before Azure sync).
