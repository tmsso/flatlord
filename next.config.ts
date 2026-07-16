import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin explicitly: this machine has an unrelated lockfile in the user's
  // home directory that would otherwise confuse Turbopack's root inference.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
