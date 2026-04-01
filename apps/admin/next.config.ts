import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  transpilePackages: ["@budget/shared-types", "@budget/shared-utils"],
  typescript: {
    // Monorepo has dual @types/react copies (root override 19.1 vs admin 19.2).
    // Actual type safety is enforced by `tsc --noEmit` with skipLibCheck.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
