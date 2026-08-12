import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "@mozilla/readability", "linkedom"],
};

export default nextConfig;
