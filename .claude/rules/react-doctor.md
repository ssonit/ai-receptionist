---
description: Run react-doctor after React/UI changes so the workflow is never skipped
paths:
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
---

# React Doctor (required after UI work)

After finishing React/Next UI changes:

```bash
npm run doctor
# = npx react-doctor@latest --verbose --scope changed
```

- Score drop / errors → fix, then re-run.
- Full scan: `npm run doctor:full`.
- Project skill path: `.claude/skills/react-doctor` (also `.agents/skills`, `.codex/skills`).
- **Never** run `npx react-doctor install --yes` in this repo — it copies the skill into every detected agent. Only Claude, Cursor (`.agents`), and Codex are wanted.
