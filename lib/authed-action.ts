/**
 * The auth gate every server action passes through. The real gate is ticket
 * 08 (the single shared password); until then this is a thin pass-through so
 * the call sites are already in place — when ticket 08 lands, only this file
 * changes, not the actions it wraps.
 *
 * The wrapper is generic over the action's argument list and return type so
 * the type signature at every call site is preserved.
 */
export function authedAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => action(...args);
}
