import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Avoid picking a parent-folder lockfile as workspace root on this machine
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
