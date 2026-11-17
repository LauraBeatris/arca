import type { NextConfig } from "next";
import { FACSIMILE_HOSTS } from "./lib/facsimiles";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Poems are read from disk, so they must travel with the server bundle.
  outputFileTracingIncludes: {
    "/*": ["./content/**/*"],
  },
  // Facsimiles on the back of a sheet may come from these hosts too.
  images: {
    remotePatterns: FACSIMILE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/**",
    })),
  },
};

export default nextConfig;
