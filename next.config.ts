import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin explicitly: this machine has an unrelated lockfile in the user's
  // home directory that would otherwise confuse Turbopack's root inference.
  turbopack: {
    root: import.meta.dirname,
  },
  // Dev access over Tailscale (hostname "intermouse") — silences the "Next
  // dev resource blocked" warning for the HMR websocket from this origin.
  // Turned out NOT to be the fix for request-derived redirects defaulting
  // to "localhost:<port>" for remote clients (see auth/callback/route.ts) —
  // that's unrelated and still happens with or without this setting. Kept
  // anyway since it's the correct, documented fix for the HMR warning
  // itself.
  allowedDevOrigins: ["intermouse"],
  // /fonts (vendored IBM Plex Sans TTFs for @react-pdf/renderer, see
  // src/lib/documents/pdf-fonts.ts) is only ever touched via a runtime
  // `path.join(process.cwd(), "fonts", ...)` string, which Next's
  // automatic serverless file-tracing can't statically discover — without
  // this, the TTFs would work locally but be silently missing from the
  // deployed Vercel function, breaking PDF generation only in prod.
  outputFileTracingIncludes: {
    "/**": ["./fonts/**"],
  },
};

export default withNextIntl(nextConfig);
