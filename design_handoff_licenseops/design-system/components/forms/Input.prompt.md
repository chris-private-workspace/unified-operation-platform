**Input** — single-line text field. Icon-led for search, plain for forms.

```jsx
<Input icon={<SearchIcon/>} placeholder="Filter SKU…" value={q} onChange={e=>setQ(e.target.value)} />
```

`trailing` holds a keyboard hint or unit. Disabled state uses the `--hover` well (used for SSO-managed fields).
