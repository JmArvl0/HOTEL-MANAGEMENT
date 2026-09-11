/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" },
      { protocol: "https", hostname: "vztkkugkvqjghftnlxxr.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  typescript: { ignoreBuildErrors: true },
  // Admin System Health counts local migration files at runtime to compare
  // against the remote ledger — bundle them with the route on serverless.
  outputFileTracingIncludes: { "/api/admin/data": ["./supabase/migrations/**"] },
};

export default nextConfig;
