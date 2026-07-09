**Dialog** — centered modal over a 45% scrim; click-scrim or ✕ closes.

```jsx
<Dialog open={open} title="Edit SKU · Copilot" onClose={close}
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
  …fields…
</Dialog>
```

For heavier flows (the assign API run) use a wider custom panel; Dialog is for short edits and confirmations.
