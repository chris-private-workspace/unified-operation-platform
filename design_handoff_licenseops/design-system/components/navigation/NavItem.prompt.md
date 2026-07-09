**NavItem** — sidebar row. Active fill, optional trailing count, collapsed icon-only mode.

```jsx
<NavItem icon={<GridIcon/>} label="Overview" active onClick={go} />
<NavItem icon={<AlertIcon/>} label="Drift Alerts" count={3} countTone="danger" onClick={go} />
<NavItem icon={<BoxIcon/>} label="Offboarding" disabled soon />
```

Use `countTone="danger"` for open drift alerts. Roadmap/future items get `disabled soon`.
