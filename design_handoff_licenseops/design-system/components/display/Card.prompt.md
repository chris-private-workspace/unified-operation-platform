**Card** — the console surface. Bordered, 12px radius, flat resting shadow.

```jsx
<Card title="Needs attention" action={<a>View all →</a>}>…</Card>
<Card padded={false}>{/* full-bleed table */}</Card>
```

Set `padded={false}` when the body is a table or grid that should reach the card edges.
