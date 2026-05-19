/**
 * Tunables for the Tonight ranking. Held in their own module so a reader can
 * see the whole knob-set in one glance, and so tests can import the constants
 * (`CAP`, `OVERDUE_THRESHOLD`) by reference instead of duplicating literals.
 *
 * The ranking math is pure integer arithmetic — these constants are integers
 * by intent. See ADR-0003 (ranking in TypeScript, not SQL).
 */

/**
 * The recency ceiling, in days. Per-Option and per-Tag recencies are clamped
 * to this value, so an Option last eaten years ago does not outweigh an Option
 * never eaten (`null` recency maps to `CAP`). 60 days is the household-scale
 * horizon: beyond two months, "longer" stops carrying useful signal.
 */
export const CAP = 60;

/** Weight on the per-Option recency term (the anti-repeat signal). */
export const W_OPTION = 1.0;

/** Weight on the variety term (the mean of per-Tag recencies). */
export const W_TAG = 1.0;

/**
 * A Tag is **overdue** once its per-Tag recency reaches this many days.
 * Used to render overdue Tag chips at the green end of the recency heatmap.
 */
export const OVERDUE_THRESHOLD = 14;
