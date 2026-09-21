import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "postgres",
    "exceljs",
    "bcryptjs",
    "mammoth",
    "pdf-parse",
    "@anthropic-ai/sdk",
  ],
};

export default nextConfig;
