import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ["@budget/shared-types", "@budget/shared-utils"],
  typescript: {
    // Monorepo has dual @types/react copies (root override 19.1 vs admin 19.2).
    // Actual type safety is enforced by `tsc --noEmit` with skipLibCheck.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
