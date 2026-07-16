import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin explicitly: this machine has an unrelated lockfile in the user's
  // home directory that would otherwise confuse Turbopack's root inference.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default withNextIntl(nextConfig);
