# 13 — Remove a pick from Tonight's dinner

Status: ready-for-agent
Type: AFK

## Parent

[PRD: Pick Me a Dinner — whole-app build](../PRD.md)

## Source

This ticket is the complete, self-contained build spec — implement exactly what it describes, against the final shipped behavior of the app. There is no external reference repository or background PRD to open; everything needed is in this file and the linked tracker docs. Domain terms: [`../CONTEXT.md`](../CONTEXT.md). Visual system: [`../DESIGN.md`](../DESIGN.md).

## What to build

Picking is one tap, so mis-taps happen. Each `DecidedRow` in the "Tonight's dinner" block (`app/tonights-dinner-block.tsx`) gets an inline "Remove" control that deletes today's Log entry for that Option — letting the Household correct a Pick without leaving Tonight. In the decided row layout the "Remove" control sits on the row's right edge, beside the Option name link, above the chip row and action buttons.

"Remove" uses the app's established inline-confirm interaction (plan §17): a confirm step in place, no modal and no undo-toast — the same pattern destructive actions already use elsewhere, e.g. Delete on the Log screen. The control is a small `RemoveControl` component with local `confirming` state: the first tap arms it; once armed it shows a danger-styled "Remove" button and a "Cancel" button (separated by a quiet `·`). The armed "Remove" deletes today's Log entry for that Option; "Cancel" disarms it back to the single resting "Remove" button.

"Remove" reuses the existing `deleteLogEntry` server action — **no new mutation is added**. It deletes by the entry `id` carried as `entry.entryId` on each `TonightsDinnerEntry` (the today Log entry id that `getTonightData` returns and `splitTonight` threads through — see ticket 11). `deleteLogEntry` already revalidates Tonight (`revalidatePath("/")`), so on the next render the server recomputes `splitTonight` from the remaining Log entries: the removed Option drops out of the decided block and reappears in the picker, with no post-delete cleanup in the component — `RemoveControl` simply unmounts with its row. Removing the last Option from Tonight's dinner leaves `tonightsDinner` empty, so `TonightScreen` renders picker mode again on its own — the same server-side mode logic from ticket 11, with no special-casing.

The server actions need no new tests: `deleteLogEntry` is already covered by the Log suite and "Remove" reuses it as-is. Consistent with v1 there are no UI component unit tests; the "Remove" control is verified by hand. It must be keyboard-operable with visible focus and meet the 44×44px touch-target minimum (`min-h-11`/`min-w-11`).

## Acceptance criteria

- [ ] Each decided-block row has an inline "Remove" control on the row's right edge, beside the Option name
- [ ] "Remove" arms an inline confirm on first tap, showing a confirming "Remove" plus a "Cancel"; "Cancel" disarms it
- [ ] Confirming "Remove" deletes today's Log entry for that Option, identified by the `entryId` on its `TonightsDinnerEntry`
- [ ] After a Remove the Option is gone from Tonight's dinner and reappears in the picker (the server recomputes `splitTonight` on revalidation)
- [ ] Removing the last Option in Tonight's dinner drops the screen back to picker mode with no special-casing
- [ ] Removal reuses the existing `deleteLogEntry` server action — no new server action is introduced
- [ ] "Remove" is keyboard-operable with visible focus and meets the 44×44px touch-target minimum

## Blocked by

- 12 — Action buttons on a picked Option (the `DecidedRow` and
  `app/tonights-dinner-block.tsx` this ticket extends are built there)
