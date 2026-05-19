/**
 * §17 loading placeholder for `/log`. Renders the same `.column` shell the
 * screen does, with a low-contrast hint so the layout stays stable while the
 * Log query loads.
 */
export default function LogLoading() {
  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Log</h1>
      <p className="text-meta text-muted" role="status" aria-live="polite">
        Loading…
      </p>
    </main>
  );
}
