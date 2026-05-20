/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle at `.next/standalone` for the
  // production Docker image (see `Dockerfile`).
  output: "standalone",
};

export default nextConfig;
