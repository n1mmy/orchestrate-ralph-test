/**
 * Ranking constants — pulled out so a tuning change is one edit.
 *
 * - `CAP`: ceiling on per-Option and per-Tag recency. Beyond this we stop
 *   discriminating "really long ago" from "even longer ago"; the chip flips
 *   from `Nd` to `60d+`.
 * - `W_OPTION`, `W_TAG`: weights for the two halves of the Score (per-Option
 *   recency and per-Tag recency). Both are 1.0 at v1.
 * - `OVERDUE_THRESHOLD`: per-Tag recency at which a Tag chip flips into its
 *   greener "overdue" tint on Tonight.
 */
export const CAP = 60;
export const W_OPTION = 1.0;
export const W_TAG = 1.0;
export const OVERDUE_THRESHOLD = 14;
