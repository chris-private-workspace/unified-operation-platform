**Stepper** — compact dot progress for a request line item's stage.

```jsx
<Stepper steps={['Requested','Ready','Assigned']} current="Ready" />
<Stepper steps={['Requested','Quoting','OpCo approved','Awaiting vendor','Ready','Assigned']} current={1} />
```

Two canonical paths: short (3 dots) and procurement (6 dots). Current dot carries the soft accent ring.
