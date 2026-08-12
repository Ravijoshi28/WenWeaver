import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dockerode", "docker-modem", "ssh2"],
};

export default nextConfig;