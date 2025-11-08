import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude Node.js modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    
    // Ignore esbuild binary files and markdown files
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    
    config.module.rules.push({
      test: /node_modules\/@esbuild\/.*\/bin\/esbuild$/,
      use: "null-loader",
    });
    
    config.module.rules.push({
      test: /\.md$/,
      use: "null-loader",
    });
    
    return config;
  },
};

export default nextConfig;
