/**
 * Snapshot-format helpers used to render Household-authored free text into
 * the AI-search snapshot. The single helper `delimit` wraps a value in
 * `<household-text>...</household-text>` so the model cannot read it as
 * instructions — a prompt-injection guard.
 *
 * The opening and closing tokens are deliberately uncommon so an attacker
 * cannot smuggle through a closing token typed inside a Tag or note.
 */

const OPEN = "<household-text>";
const CLOSE = "</household-text>";

/**
 * Wrap a string in the household-text delimiter, returning `null` straight
 * through. A nested closing token in the input is escaped by doubling the
 * `<` so the wrap is always unambiguous.
 */
export function delimit(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // Defense in depth — never let an authored string smuggle in a closing
  // delimiter that would tear the wrap apart.
  const safe = value.split(CLOSE).join("</household-text-escaped>");
  return `${OPEN}${safe}${CLOSE}`;
}
