# ProFocus v0.7 — write time blocks to Google Calendar (opt-in)

Read `CLAUDE.md`, `.claude/skills/profocus/SKILL.md`, `.taste-skill/plan-features.md` Part D1, then `src/lib/calendar.ts` (+ test), `src/state/calendar.tsx`, `src/state/auth.tsx`, `src/views/SettingsView.tsx` (Account section, calendar line), `src/lib/types.ts` (`Settings`, `TimeBlock`), `src/lib/storage.ts` (`DEFAULT_SETTINGS`), `docs/google-oauth-setup.md`, `README.md`. Rules as before: smallest complete change, tokens-only CSS, tests for new logic, no git commands, no attribution lines anywhere.

## Behaviour
Off by default. When **Settings → Account → "Show my time blocks in Google Calendar"** is on and the calendar is connected, every ProFocus block (`source !== 'google'`) in the import window (the same window the import uses) has a matching event in the user's primary Google Calendar. Creating, moving, resizing, renaming or deleting a block is mirrored within a few seconds. ProFocus never creates, changes or deletes any event it did not create.

## Scope
`CALENDAR_SCOPE` becomes `https://www.googleapis.com/auth/calendar.events` (it allows reading events too, so the import keeps working). Users who connected with the old scope must reconnect once: when a write returns 403 with `insufficient` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT` in the body, set status `expired` with the message "Reconnect Google Calendar to allow ProFocus to add events." Update `API_HINT` and the runbook (§1.4 and Data Access step) to name `calendar.events` instead of `calendar.readonly`.

## Identity without extra state — deterministic event ids
`export function eventIdFor(blockId: string): string` → `'pf' + base32hex(utf8(blockId))` lower-case, characters `0-9a-v` only (Google's allowed set), length ≥ 5. Pure, tested (stable, valid charset, different ids for different blocks). Every pushed event also carries `extendedProperties.private.profocusBlockId = block.id`.

Because the id is derived from the block id, two devices pushing the same block cannot create duplicates: an insert that returns **409** means the event exists → follow with a PATCH.

## Pure planning (`src/lib/calendar.ts`, tested)
```ts
export interface OwnEvent { blockId: string; date: DateKey; start: number; end: number; title: string }   // parsed from our own events (local time)
export function ownEvents(events: GoogleEvent[]): OwnEvent[]            // events with private.profocusBlockId; reuse the existing local-time parsing
export function blockToEvent(b: TimeBlock, timeZone: string): object     // { id, summary, description: 'From ProFocus', start: {dateTime, timeZone}, end: {dateTime, timeZone}, extendedProperties: { private: { profocusBlockId } } }
export function planWrites(blocks: TimeBlock[], own: OwnEvent[], range: { from: DateKey; to: DateKey }): { insert: TimeBlock[]; patch: TimeBlock[]; remove: string[] /* blockIds */ }
```
`planWrites`: consider only blocks with `source !== 'google'` and `date` in range. Missing in `own` → insert. Present but date/start/end/title differ → patch. `own` entries in range whose blockId has no local block → remove. Tests: each branch, google-sourced blocks ignored, out-of-range ignored, unchanged → nothing.
`dateTime` from local date + minutes: `new Date(y, m-1, d, h, min).toISOString()`; `timeZone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.

`eventsToBlocks` (import) must **skip** events that have `private.profocusBlockId`, so our own events don't come back as grey "G" blocks.

## Provider (`src/state/calendar.tsx`)
- Add `settings.calendarWrite?: boolean` (types + `DEFAULT_SETTINGS` stays without it → falsy).
- After each successful import (which already fetched the events list), keep `ownEvents(events)` in a ref.
- A `reconcile()` runs: after an import, and debounced 3 s after `state.blocks` changes — only when `calendarWrite`, a provider token, and status `connected`. It calls `planWrites` and performs, sequentially:
  - insert: `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` with `blockToEvent` body; 409 → `PATCH .../events/{eventIdFor(id)}`.
  - patch: `PATCH .../events/{eventIdFor(id)}` with the same body minus `id`.
  - remove: `DELETE .../events/{eventIdFor(blockId)}`; 404/410 are success.
  - After each success update the own-events ref so the next reconcile is a no-op.
- In-flight guard (one reconcile at a time; if blocks change meanwhile, run once more after). Never throw; errors go to `info.error` with status `error`, 401 → `expired`. Expose `lastPushAt?: string` on `useCalendar()`.
- Turning the toggle **off** does not delete anything already pushed (say so in the hint); turning it on runs a reconcile immediately.

## UI (Settings → Account, signed in, calendar connected)
Under the existing calendar line: a checkbox row "Show my time blocks in Google Calendar" with a 12px grey hint: "Adds and updates events for blocks you plan here. Only events ProFocus created are ever changed. Turning this off keeps the events already added." When on and pushed: "Last synced 12:03". No new primary button. Week header unchanged.

## Tests
`src/lib/calendar.test.ts`: `eventIdFor`, `ownEvents`, `blockToEvent` (shape, private prop, ISO times), `planWrites` (all branches), `eventsToBlocks` skips own events. One provider test is optional; if added, mock `fetch` and assert the 409→PATCH path.

## Docs
`docs/google-oauth-setup.md` §1.4 and README calendar paragraph: scope `calendar.events`, the toggle, the "only its own events" guarantee, and that existing users reconnect once.

## Verify
`npm run typecheck && npm test && npm run build`. Report what changed, test count, and that the live Google write was not exercised.
