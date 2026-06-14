/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,

  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: "/login/:path*",
        headers: [
          {
            key: "Link",
            value:
              "</gerit-login-light.jpg>; rel=preload; as=image; type=image/jpeg; fetchpriority=high",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
