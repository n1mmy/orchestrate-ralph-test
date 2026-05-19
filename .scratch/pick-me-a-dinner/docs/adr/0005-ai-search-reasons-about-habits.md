# AI search reasons about habits, not just recency

ADR-0004 added AI search as an additive, triggered layer over the
deterministic ranking. In practice it added little: the model was fed the same
pre-digested recency integers the deterministic Score already uses and was
forced to answer in one shot, so it simply re-sorted by recency — mirroring the
default list instead of improving on it. We are reshaping the AI search path so
the model **reasons about the household's eating history** — its habits and
rhythms — rather than re-sorting recency. The household's canonical case: a Tag
eaten roughly weekly should rank high once it is a week overdue, even when
other Options carry a higher raw recency.

## Considered options

- **Status quo.** AI search keeps mirroring recency and adds nothing the
  deterministic Score does not already give. Rejected: it makes the feature
  pointless.
- **A deterministic cadence term in the ranking.** Compute each Tag's typical
  interval from the Log and rank by how overdue an Option is against its own
  rhythm. Deterministic, unit-testable, explainable, and it would fix the
  canonical case in the *default* Tonight list with no query at all. Rejected:
  it can only catch the patterns we think to encode. The household explicitly
  wants patterns nobody articulated — day-of-week rhythm, what follows what,
  options quietly drifting out of rotation — and a fixed-form cadence term
  cannot discover those.
- **Open-ended AI pattern discovery (chosen).** Give the model legible raw
  history and room to think, and let it find whatever rhythms it can — cadence
  among them — without us enumerating them in advance.

## Consequences

- ADR-0004 still holds: AI search remains additive and triggered, the
  deterministic Score still loads by default and is still the offline-proof
  fail-safe floor. This decision changes only how the AI path reasons.
- The model snapshot **deliberately withholds the pre-digested recency
  integers** and presents the Log as plain dated history (with day-of-week). A
  future reader should not "restore" recency to the snapshot — it is removed on
  purpose, so the model reasons from history instead of anchoring on a
  ready-made sort key. Recency it can re-derive trivially from the dates.
- AI search now uses extended thinking: a call costs more tokens and runs tens
  of seconds rather than a few. Acceptable because it is a deliberate, triggered
  action with a pending state and a fallback — never the home-screen load.
- The valuable re-ranking path is now non-deterministic and not unit-tested —
  the opposite of ADR-0003's pure, tested ranking. Iteration is done with a CLI
  harness against real data, judged by whether the rationales surface something
  genuinely useful. Reverting to the deterministic cadence option later means
  building that math from scratch.
- The size of the AI result is query-dependent (tightened post-launch,
  2026-05-17 — the original prompt let the model freely decide how many to
  return and it under-returned on open queries). A query that genuinely
  narrows the Catalog ("something light") returns a focused shortlist of the
  Options that fit. An empty query, or an open one that narrows nothing
  ("recommend something"), returns the whole candidate Catalog ranked — each
  rationale then does double duty: a positive reason near the top, a "why this
  is a weaker pick" note near the bottom. The model itself judges whether a
  query narrows; the snapshot shape and the withheld recency above are
  unchanged by this.
