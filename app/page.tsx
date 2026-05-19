/**
 * Root route — the walking skeleton's first rendered screen. It renders inside
 * the shared `.column` centered-column primitive, the layout contract every
 * later screen inherits.
 */
export default function HomePage() {
  return (
    <main className="column">
      <h1 className="font-display text-h1 font-semibold">Pick Me a Dinner</h1>
      <p className="text-body">
        Decide what&apos;s for dinner each night.
      </p>
    </main>
  );
}
