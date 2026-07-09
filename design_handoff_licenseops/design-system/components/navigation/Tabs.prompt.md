**Tabs** — underline section switcher. Accent underline on the active tab, optional count.

```jsx
<Tabs value={tab} onChange={setTab}
  tabs={[{value:'summary',label:'Summary'},{value:'analytics',label:'Analytics',count:3}]} />
```

Use for in-page sections. For binary view/scope switches (theme, role, Single/Compare) use `SegmentedControl` instead.
