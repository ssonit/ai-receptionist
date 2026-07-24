import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // vercel-react-best-practices: bundle-barrel-imports
  experimental: {
    optimizePackageImports: ["lucide-react", "@tabler/icons-react"],
  },
};

export default withEve(nextConfig);
