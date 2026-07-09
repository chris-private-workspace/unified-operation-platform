**Badge** — soft-tinted status pill, optional leading dot. The console's universal state marker.

```jsx
<Badge tone="ok" dot>Ready to assign</Badge>
<Badge tone="warn">In procurement</Badge>
<Badge tone="danger" dot>Blocked · sync</Badge>
```

Stage→tone map: Ready→`ok`, Quoting/Awaiting vendor→`warn`, Requested→`info`, Blocked→`danger`, Assigned→`neutral`, AI→`purple`.
