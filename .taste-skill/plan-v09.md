# v0.9 — New look, all screens ("Accent ladder", dark sidebar)

The user picked: **dark sidebar, a bright accent colour, big numbers and section headings, coloured
project bands on blocks, same layout, new skin everywhere.** This is a visible restyle. Layout,
components, behaviour and tests stay as they are. Most of the work is CSS tokens and rules. The direction
sheet is `.taste-skill/app/direction.json` (style `accent-ladder`, kind creator); reprint it with
`node <skill>/scripts/draw.mjs --show --out .taste-skill/app`.

Skill: `/root/.claude/skills/synced/1565b693-f868-4aa5-8795-1eb52de3aa00_92af7b0f-86fb-46f0-bcd0-057a4fe80e34/design-taste-frontend`
(read `references/app-screens.md` once).

## The move
One brand hue, **raspberry `#b8336a`**, at full strength only on small marks: the filled primary button, the
active nav icon, checked checkboxes, the now-line, progress fills, chart series 1, focus rings. Its
pale tints do all the area work: the active row tint, today's column header, the highlight card, badges, progress
tracks. No second accent family, no violet or indigo, no gradients, no glows, no shadows at rest (the
lifted-while-dragging block shadow stays).

Deliberate deviations from the sheet, at the user's request (keep these):
- **Dark sidebar** (the sheet's shell is light). The sidebar and the phone bottom bar sit on near-black `#151517`. Nav
  labels are `#a8a8ad` and turn `#ffffff` when active. The active row gets a `#26262b` fill and its
  icon turns raspberry (use the lighter `#e0699b` on dark for contrast). The brand wordmark is white, and the Search button
  is `#1f1f23` with `#a8a8ad` text.
- **Big numbers and headings.** Page title 32px/700. The Today greeting is 48px/700 DM Sans (no serif any
  more), letter-spacing -0.02em. KPI/tile values 40px/500 tabular. Section and panel titles 18px/600.

## Tokens (replace the `:root` block in `src/styles.css`; keep the token NAMES the app already uses)
Light:
- ground `#fbf7f8` (the palest raspberry tint, so page and tints read as one family). surface `#ffffff`. panel `#ffffff`
  with a 1px `--border` (cards become white on the tinted ground, not tonal-on-white). raised `#f7f3f5`.
  active `#fdf2f7`.
- border `#ece6e9`, rule `#f4eff1`, control `#d6cfd3`, text `#16141a`, muted `#5f5a62`, faint `#6e6870`.
- accent `#b8336a`, accent-tint `#fdf2f7`, new `--accent-track: #f8dbe8`, new `--accent-ink: #6b1d3e`.
- primary `#b8336a`, primary-ink `#ffffff`, so primary buttons are raspberry fills (the one filled style).
- positive `#247b50`, negative `#c4242a`, warning `#92400e`; pills as in the sheet (`--pill-*`).
- new `--sidebar-bg: #151517; --sidebar-ink: #a8a8ad; --sidebar-ink-active: #ffffff; --sidebar-active: #26262b; --sidebar-mark: #e0699b;`
- radius-card 12px, radius-row 8px, radius-input 8px, radius-control 8px (buttons become rounded
  rectangles, not 999px pills; chips and habit pills may stay at 999px).
- font `'DM Sans', Inter, system-ui, sans-serif`. Point `--font-greeting` at the same family.
- fs-title 32px, fs-greeting 48px, fs-section 18px, fs-kpi 40px, fs-body 14px, fs-small 12px.

Dark theme (both the media-query block and `[data-theme='dark']`): ground `#0c0b0d`, surface `#121114`,
panel `#17151a`, raised `#1d1b20`, active `#2a1520`, border `#2a272d`, rule `#1d1b20`, control `#4a454e`,
text `#f7f5f8`, muted `#b3adb5`, faint `#958f97`, accent `#e0699b`, accent-tint `#2a1520`,
accent-track `#4a2236`, accent-ink `#f8c9dc`, primary `#e0699b`, primary-ink `#1a0a12`. Sidebar tokens
stay the same dark values. Positive, negative, warning and pills keep the current dark values.

## Fonts
`index.html`: replace the Instrument Sans/Serif link with
`https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap`.

## Rules to restyle (everything else should follow the tokens on its own)
1. **Shell.** The sidebar uses `--sidebar-*`. The phone bottom nav is dark too. The main sheet keeps its frame on the
   tinted ground. The Search/⌘K button and the GettingStarted panel are restyled to match.
2. **Today.** 48px/700 greeting. The four tiles are white cards with a 1px border, 40px/500 values and a 12px muted
   caption. The highlight card gets an accent-tint fill, a 22px/600 title and an accent check ring. Panel titles are 18/600.
3. **Time blocks (Week grid and Today timeline): project bands.** Each block has a **4px solid left band** in its
   project colour (`--c`; fall back to `--accent` when there is no project). The fill is the project colour at about
   14% (`color-mix(in srgb, var(--c, var(--accent)) 14%, var(--surface))`), and the title text is `--text` at 500 weight.
   Meeting, personal and break kinds keep their distinct treatment, but meeting and personal also get the band. Google
   events (`.is-external`) get a neutral grey band and a `--raised` fill. The ghost slot and drop line use accent.
   Today's column header shows the date number in accent with an accent-tint pill behind it. The now-line is accent.
4. **Tasks.** Checkboxes get a 1.5px `--control` ring and a raspberry fill with a white tick when done. Rows are white with a
   1px border and 8px radius. Priority dots keep their semantic colours (high = negative, med = warning, low = muted).
5. **Progress (goals, seasons, timer ring, habit streaks).** The track is `--accent-track` and the fill is `--accent`.
6. **Review charts.** Series 1 is `--accent` and series 2 is muted grey. No rainbow.
7. **Buttons.** `.btn.primary` and any filled button use `--primary`/`--primary-ink`. Secondary buttons are white with a 1px
   `--control` border. Danger stays negative-coloured text.
8. Remove any leftover teal (`#1b6e66`, `#3fa79c`, `#e4f0ee`, `#122422`) from all CSS. Grep for it.
9. Project colours in `src/lib/storage.ts` stay as they are, except `#9b5de5` (violet), which becomes `#c2410c`, so
   new projects never get violet. Existing user data keeps its colours, so do not migrate it.
10. `public/icon.svg`: change the stroke colour from teal to `#b8336a`. Update `<meta name="theme-color">` if present.
11. Update the header comment of `styles.css` to describe the new direction.

## Constraints
- **CSS-first.** Touch TSX only where a class hook is truly missing, and keep those changes small. Do not change behaviour,
  text or tests, except a test that asserts a removed font or colour string, if one exists.
- Keep `motion.css` behaviour, including reduced motion.
- Text contrast: body text and muted text must pass 4.5:1 on their grounds, in both themes and on the dark sidebar.

## Verify (all must pass before you report)
- `npm run typecheck && npm test && npm run build`.
- `node <skill>/scripts/lint.mjs src/styles.css src/motion.css src/features.css src/coach.css`: no new FAILs.
- `npm run build && npx vite preview --port 4192`. Then run
  `node <skill>/scripts/inspect.mjs --app "http://localhost:4192/?demo=1#today" --out .taste-skill/after-v09-today`,
  then the same for `#week`, `#review` and `#settings`: 0 FAIL. Also take a dark-theme screenshot of Today
  (Playwright with `colorScheme: 'dark'`) at 1440 and 390.
- Look at the 1440 and 390 screenshots yourself and fix anything that looks broken. Kill the preview server.
- Do not run any git commands. Report the files changed, the inspector results, and what you did not verify.
