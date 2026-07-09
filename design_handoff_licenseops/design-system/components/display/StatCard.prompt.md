**StatCard** — Overview KPI tile. Big number, tinted icon chip, optional headroom pill.

```jsx
<StatCard label="Open requests" value="6" tone="info" icon={<InboxIcon/>} sub="across all OpCos" />
<StatCard label="Licenses assigned" value="1,053" tone="ok" delta="+42 free" sub="seats in use" />
```

`tone` only tints the icon chip — the value stays neutral. Reserve for headline metrics (4 across the Overview).
