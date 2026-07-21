import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "production"
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const framePolicy = process.env.REPL_ID
  ? "frame-ancestors 'self' https://replit.com https://*.replit.com"
  : "frame-ancestors 'self'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdf-parse", "yauzl"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Content-Security-Policy",
          value: `default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; ${framePolicy}; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; connect-src 'self'`,
        },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }, {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
    }];
  },
};

export default nextConfig;
