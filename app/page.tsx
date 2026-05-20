// The root route is a data page in the shipped app; every data page is
// `force-dynamic` so `next build` can render with no live `DATABASE_URL`.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="column">
      <h1 className="font-display text-h1">Pick Me a Dinner</h1>
      <p className="text-body text-muted">
        The walking skeleton is live — Tonight, the Catalog, and the Log will
        land in the tickets that follow.
      </p>
    </main>
  );
}
