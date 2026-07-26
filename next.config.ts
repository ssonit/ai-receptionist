import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // vercel-react-best-practices: bundle-barrel-imports
  experimental: {
    optimizePackageImports: ["lucide-react", "@tabler/icons-react"],
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        source: "/((?!embed).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default withSentryConfig(withEve(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  silent: true,
  widenClientFileUpload: Boolean(sentryAuthToken),
  sourcemaps: {
    disable: !sentryAuthToken,
  },
});
