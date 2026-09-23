import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Everything the app loads comes from its own server; nothing on the exam
 * screen should ever talk to anywhere else.
 *
 * - 'unsafe-inline' scripts: Next inlines its bootstrap scripts.
 * - 'wasm-unsafe-eval': the face detector is WebAssembly (MediaPipe).
 * - blob: images and media: the webcam preview.
 * - 'unsafe-eval' in development only, for React's hot reload.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'" + (dev ? " ws: wss:" : ""),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nothing may frame the app, which stops a page overlaying the exam.
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "postgres",
    "exceljs",
    "bcryptjs",
    "mammoth",
    "pdf-parse",
    "@anthropic-ai/sdk",
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          // The camera is needed on this site; nothing else is.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
