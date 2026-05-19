# Ranking computed in TypeScript, not SQL

Tonight's ranked list is produced by a pure TypeScript function, not a SQL
`ORDER BY`. The Tonight server component fetches the active Options, their Tag
associations, and the non-future Log entries, then computes every Score in
process.

A personal Catalog is tiny — tens of Options, hundreds of Log entries — so
there is no performance reason to rank in the database. Keeping the ranking in
a pure function makes it directly unit-testable (its table tests are the
reference test pattern for the project) and keeps the Score, the
explanation-chip logic, and the cold-start fallback in one readable place
instead of spread across a query. A reader who "optimizes" this into SQL would
trade that testability and clarity for a speedup the dataset size makes
irrelevant.
