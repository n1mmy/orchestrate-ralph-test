import type { NextConfig } from "next";

/**
 * Next.js config. `output: "standalone"` produces a minimal self-contained
 * server bundle under `.next/standalone` that the Dockerfile's `runner` stage
 * copies as the runtime artifact — no `node_modules/` in the image, just the
 * traced files Next.js needs to boot.
 */
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
