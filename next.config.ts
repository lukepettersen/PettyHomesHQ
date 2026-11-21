import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Uploads pass through the sign-in proxy, which otherwise cuts request bodies off at 10 MB (Files card allows 100 MB).
  experimental: { proxyClientMaxBodySize: "101mb" },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Event signup pages are private: only reachable with their long random link, never listed by search engines.
      { source: "/join/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
