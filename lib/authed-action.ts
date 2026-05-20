/**
 * Call-site wrapper for server actions that require the Household to be
 * signed in. Ticket 06 lands the real password-cookie check; until then this
 * is a thin pass-through so the call sites already read in their final shape
 * — `export const foo = authedAction(async (…) => { … })`.
 */
export function authedAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => action(...args);
}
