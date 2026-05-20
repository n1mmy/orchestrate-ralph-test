/**
 * Thin re-export of `formatDinnerDate` under its historical name. The label
 * logic moved into `lib/dinner-grouping.ts` so both the Log screen and the
 * Option detail page's merged History section can share it; this alias keeps
 * the Log screen's existing import path working without changing every
 * call-site at once.
 */
export { formatDinnerDate as dateLabel } from "@/lib/dinner-grouping";
