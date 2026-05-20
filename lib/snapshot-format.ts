/**
 * Snapshot-format helpers — the tiny utility module the AI-search snapshot
 * builder uses to render Household-authored free text safely. The only export
 * is `delimit`: wrap one piece of Household-authored prose (an Option name, a
 * Tag, a note, a Rejection reason, the search query itself) in
 * `<household-text>` markers so the model cannot interpret catalog text as a
 * fresh instruction.
 *
 * Kept as its own file (rather than buried inside `lib/ai-search.ts`) so the
 * delimiter is a single import every snapshot site shares — adding a new
 * Household-text field anywhere in the snapshot is one tagged call.
 */

/** The bracket pair every Household-authored string is wrapped in. */
const OPEN = "<household-text>";
const CLOSE = "</household-text>";

/**
 * Wrap a string in the `<household-text>` delimiters so the model reads it as
 * data, not as instructions. `null` and `undefined` (the optional fields like a
 * Log entry's `note` or a Rejection's `reason`) pass through unchanged so the
 * caller can render the surrounding shape (`{ note: null }`) without an extra
 * branch. The delimiters are appended literally — any pre-existing
 * `<household-text>` substring inside `value` is left intact; defeating the
 * delimiter requires the same literal tag the model is told to ignore, and the
 * worst case is the model treating the inner text as data anyway.
 */
export function delimit<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return (OPEN + value + CLOSE) as T;
}
