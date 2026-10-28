import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge clear of the bottom navigation.
  devIndicators: { position: "top-left" },
  cacheComponents: true,
  // Build-time copy of the FILE size limit for early client-side checks (the
  // server reads MAX_FILE_SIZE_MB again at runtime and is the authority).
  env: { NEXT_PUBLIC_MAX_FILE_SIZE_MB: process.env.MAX_FILE_SIZE_MB || "2048" },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
