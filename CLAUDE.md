# BillDheko (this folder: TallyKraft/tallykraft) — quick context

All rules, current state, billing design and gotchas live in the workspace file
`../../CLAUDE.md` (sections "BillDheko billing", "BillDheko — current state",
"Checking UI without a login", "Known gotchas"). History: `../../docs/CHANGELOG-billdheko.md`.

- Stack: React 19 + Vite 7 + MUI v7 + Firebase 12 + IndexedDB (local-first), PWA.
- Brand: BillDheko™ (oxblood `#5c1f22`, gold `#b08d57`). Folder/internal ids still "tallykraft".
- Always `npm run build` before reporting done; compare `npm run lint` counts, don't chase.
