import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge clear of the bottom navigation.
  devIndicators: { position: "top-left" },
  cacheComponents: true,
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
