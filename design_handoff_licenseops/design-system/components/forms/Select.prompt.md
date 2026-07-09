**Select** — native dropdown matching the Input look; for category, timezone, language pickers.

```jsx
<Select value={cat} onChange={e=>setCat(e.target.value)}>
  <option>Base</option><option>Add-on</option><option>Security</option>
</Select>
```
