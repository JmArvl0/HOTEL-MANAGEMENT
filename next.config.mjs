/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow isolated QA builds without replacing a running app's output.
  distDir: process.env.HAVEN_BUILD_DIR || ".next",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" },
      { protocol: "https", hostname: "vztkkugkvqjghftnlxxr.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  typescript: { ignoreBuildErrors: false },
  // Admin System Health counts local migration files at runtime to compare
  // against the remote ledger — bundle them with the route on serverless.
  outputFileTracingIncludes: { "/api/admin/data": ["./supabase/migrations/**"] },
};

export default nextConfig;
