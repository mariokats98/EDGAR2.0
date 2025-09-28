/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  async redirects() {
    return [
      {
        source: '/screener/stocks',
        destination: '/<YOUR-STOCKS-PATH>', // e.g. '/stocks'
        permanent: false,
      },
      {
        source: '/screener/insider-activity',
        destination: '/<YOUR-INSIDER-PATH>', // e.g. '/insider'
        permanent: false,
      },
      {
        source: '/screener/crypto',
        destination: '/<YOUR-CRYPTO-PATH>', // e.g. '/crypto'
        permanent: false,
      },
      {
        source: '/screener/forex',
        destination: '/<YOUR-FOREX-PATH>', // e.g. '/forex'
        permanent: false,
      },
    ];
  },
};

export default nextConfig;