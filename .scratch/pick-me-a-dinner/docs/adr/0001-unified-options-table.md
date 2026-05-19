# Unified `options` table with a `kind` discriminator

The Catalog holds two things that look different on the surface — Home meals
and Restaurants — but play the identical role: a thing the Household can pick
for dinner, carrying Tags and ranked on Tonight. We store both in one
`options` table with a `kind` enum (`home` | `restaurant`) rather than
separate tables, so the ranking engine, the Log, and every query treat them
uniformly with no union or polymorphism.

## Considered options

The prior version of this app used separate `Meal` and `Restaurant` tables.
That forced every "what can we eat" read into a union and split the Log's
foreign key into `mealId` / `restaurantId`. The cost of the unified table is a
handful of restaurant-only nullable columns (`address`, `phone`, `lat`, `lng`,
`google_place_id`, `maps_url`) that are always null for Home meals — an
accepted, cheap trade for a single code path everywhere else.
