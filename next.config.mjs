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
};

export default nextConfig;
