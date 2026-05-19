# Expose every sensible control; don't enforce a user journey

The app's screens are task-focused — Tonight to decide, Log to review history,
Catalog to manage Options — and the easy path is to keep each screen's controls
minimal and route the Household through one intended journey (e.g. Pick only on
Tonight).

We decided the opposite: the Household flows through the app however it wants,
and no screen assumes intent. Every place an item is shown carries every
control that makes sense for that item — Pick lives on Log and Catalog rows,
not only Tonight; Bring back lives on the Option detail page, not only
Tonight's "Rejected tonight" disclosure; the Option detail page carries Pick,
Reject, Edit, Archive/Un-archive, and Delete. The single bound is screen
space: where a row genuinely cannot fit every control, the cut is deliberate
and explained — full control is the default, the trade-off is the exception.

## Consequences

- The same control appears in several places by design — this is intentional,
  not duplication to consolidate away.
- Every control must be safe to invoke from any context. Server actions are
  already auth-by-default (`authedAction`) and revalidate the affected paths,
  so a control behaves identically wherever it is placed.
