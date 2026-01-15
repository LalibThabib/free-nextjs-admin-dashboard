import type { NextConfig } from "next";

const repo = "free-nextjs-admin-dashboard";
const basePath = process.env.GITHUB_ACTIONS ? `/${repo}` : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
