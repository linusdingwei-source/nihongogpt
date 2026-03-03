import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ali-oss'],
  // Increase body size limit for file uploads (PDF, audio, images, etc.)
  serverActions: {
    bodySizeLimit: '50mb',
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    
    // 解决 Prisma 7 的 node: 前缀问题
    // webpack 对象由 Next.js 提供，不需要导入
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^node:/,
        (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        }
      )
    );

    // 仅忽略 @aws-sdk/client-s3（ali-oss 已通过 serverExternalPackages 在服务端从 node_modules 加载）
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@aws-sdk\/client-s3$/,
      })
    );
    
    return config;
  },
};

export default withNextIntl(nextConfig);
