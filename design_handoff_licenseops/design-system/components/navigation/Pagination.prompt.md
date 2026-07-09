**Pagination** — table footer pager: range summary + numbered pages.

```jsx
<Pagination page={p} pageCount={8} total={184} pageSize={25} onChange={setP} />
```

Drop it on the bottom border of an unpadded `Card` that holds a table. Active page fills accent; numbers are monospace.
