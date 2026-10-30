/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Só rodam no servidor e trazem binário nativo (Argon2) ou leem arquivos do
  // próprio pacote em tempo de execução (PDFKit): ficam fora do bundle.
  serverExternalPackages: ['@node-rs/argon2', 'pg', 'pdfkit', 'exceljs', 'qrcode'],

  experimental: {
    // O proxy (src/proxy.js) faz o Next guardar o corpo em memória; acima deste
    // teto ele é cortado em silêncio. O proxy recusa antes o que passar disto.
    proxyClientMaxBodySize: '25mb',
  },
};

export default nextConfig;
