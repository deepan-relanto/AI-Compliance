import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  // Large uploads (PDF up to 50 MB, course video/assets up to 100 MB) pass through auth middleware
  experimental: {
    middlewareClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  serverExternalPackages: ["pdfjs-dist"],
  webpack: (config, { dev }) => {
    // Required for react-pdf / pdfjs-dist to load the PDF worker correctly
    config.resolve.alias.canvas = false;

    // OneDrive can delay file events; polling avoids stale/corrupt dev bundles
    if (dev) {
      config.watchOptions = {
        poll: 2000,
        aggregateTimeout: 600,
        ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**"],
      };
    }

    return config;
  },
};

export default nextConfig;
