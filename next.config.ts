import type { NextConfig } from "next";

// CAPACITOR_BUILD=1 produces a fully static export for the APK shell:
// no server, no API routes; the client talks to the live web API.
const IS_APP = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: !IS_APP,
  partialPrefetching: !IS_APP,
  ...(IS_APP
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        turbopack: {
          rules: {
            "*.css": {
              loaders: ["@tailwindcss/turbopack"],
              as: "*.css",
            },
          },
        },
      }),
};

export default nextConfig;
