/**
 * §17 loading placeholder for the Catalog screen — a single `.column` with
 * the screen title and a muted "Loading" line. Suspense streams this while
 * `getActiveCatalog` resolves.
 */
export default function CatalogLoading() {
  return (
    <main className="column">
      <h1 className="py-lg font-display text-h1 text-ink">Catalog</h1>
      <p className="text-body text-muted">Loading…</p>
    </main>
  );
}
