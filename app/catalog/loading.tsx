/**
 * §17 loading placeholder for `/catalog`. Renders the same `.column` shell
 * the screen does, with a low-contrast hint so the layout stays stable while
 * the active Catalog loads.
 */
export default function CatalogLoading() {
  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Catalog</h1>
      <p className="text-meta text-muted" role="status" aria-live="polite">
        Loading…
      </p>
    </main>
  );
}
