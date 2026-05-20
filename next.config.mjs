/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle at `.next/standalone` for the
  // production Docker image (see `Dockerfile`).
  output: "standalone",
  webpack: (config, { nextRuntime }) => {
    // The boot-time schema check (`lib/schema-check.ts`) runs only in the
    // Node.js runtime — it imports `node:fs`, `node:path`, and the
    // `postgres` driver. The presence of `middleware.ts` causes Next.js to
    // also bundle `instrumentation.ts` for the Edge runtime, where those
    // imports are unresolvable. Short-circuit the edge bundle to a no-op so
    // webpack never follows the import graph into Postgres.
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "./lib/schema-check": false,
      };
    }
    return config;
  },
};

export default nextConfig;
