import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Pinata dedicated gateway
      { protocol: "https", hostname: "**.mypinata.cloud" },
      // Pinata public gateway
      { protocol: "https", hostname: "gateway.pinata.cloud" },
      // Public IPFS gateways (fallbacks)
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "cloudflare-ipfs.com" },
      { protocol: "https", hostname: "w3s.link" },
    ],
  },
};

export default nextConfig;
