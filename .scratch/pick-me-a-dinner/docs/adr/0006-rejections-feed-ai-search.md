# Rejections feed AI search; the model judges what is standing

ADR-0004 and ADR-0005 had AI search read the household's Log to find eating
habits. But the Log records only what was *eaten* — it has no record of what was
considered and turned *down*. When the household passes on an Option because it
is "too heavy tonight" or because "that place is closed on Sundays", that
reaction — their clearest signal about a bad fit — is invisible to the model.

We are adding **Rejections**: from the Tonight screen the household can reject an
Option for tonight's decision, with an optional short reason. A Rejection
removes the Option from tonight's list and is kept as dated history that is fed
into future AI searches. The model then reasons over not just what the household
ate but what they declined and why.

The load-bearing choice: store every Rejection flat — its optional reason and
its date — and let the **model itself** judge which reasons are standing
dislikes ("closed on Sundays") and which were one-off ("too heavy tonight"). We
deliberately encode no decay, no query-scoping, and no persistence heuristic of
our own.

## Considered options

- **No memory of Rejections (status quo).** AI search sees only the Log.
  Rejected: the household's most explicit signal about a bad fit — a deliberate
  "no, because X" — is discarded the moment the list refreshes.
- **Rejections as standing rules.** A Rejection permanently downranks the Option
  in every future search. Rejected: most Rejections are contextual ("too heavy
  *tonight*"), not verdicts on the Option; treating them as permanent rules
  poisons future searches with momentary noise.
- **Rejections scoped or decayed by coded heuristics.** Persist each Rejection
  with the query it happened under and surface it only on a similar later query,
  or fade Rejections after a fixed window. Rejected: query-similarity matching
  and decay tuning are real machinery for a single-household app, and they bake
  our guess about "similar" and "stale" into code.
- **Flat dated history, the model judges (chosen).** Store every Rejection with
  its optional reason and date. Feed the full history into the AI snapshot and
  let the model read the reason text together with the date and frequency
  pattern to decide what is structural and what was one-off — the same division
  of labour as ADR-0005, where the model reasons over raw history rather than
  pre-digested signals.

## Consequences

- A new `rejections` table enters the schema, with its own out-of-band
  migration. A Rejection row is light: an Option reference, an optional reason,
  and the date — it is not a Log entry and carries no Score weight.
- The AI search snapshot gains a Rejections block, split into *rejected tonight*
  (those Options are removed from the candidate set) and *earlier Rejections*
  (those Options stay candidates, their reasons ride along as a standing taste
  signal). The system prompt is extended to explain both. Snapshot and prompt
  size grow with Rejection history — uncapped by choice, acceptable for a single
  household; revisit only if a prompt genuinely bloats.
- The deterministic ranking (ADR-0003) is untouched. A Rejection suppresses an
  Option from the *displayed* Tonight list — deterministic list and AI results
  alike — for the rest of the day; that is a presentation filter and never
  changes a Score. The Option returns on its own the next day.
- A Rejection's effect is non-deterministic: like the rest of the AI path
  (ADR-0005) its influence is whatever the model makes of it, and it is not
  unit-tested. The deterministic Tonight list stays the offline-proof fail-safe.
- A Rejection made today can be undone ("Bring back"), which deletes the record
  so a mis-tap never reaches the model. Once the day turns a Rejection is
  settled history; pruning the historical log is left to a future feature.

_Extended by ADR-0008: Rejections become manually creatable, editable, and
freely dated (past or future) from the Log and Option detail pages. That
supersedes the reasoning here that no `(option_id, rejected_on)` constraint is
needed, and extends the snapshot to carry future-dated rows._
