import type { NextConfig } from "next";

/**
 * Dos objetivos de build:
 * - `npm run build` → standalone (autoalojado con servidor Node)
 * - `npm run build:pages` → export estático para GitHub Pages (repositorio "aos",
 *   servido en https://axcgamestudios.github.io/aos/)
 * El motor del navegador (Service Worker + Scramjet) funciona en ambos: es estático.
 */
const isPagesExport = process.env.BUILD_TARGET === "pages";

const nextConfig: NextConfig = isPagesExport
  ? {
      output: "export",
      basePath: "/aos",
      trailingSlash: true,
      images: { unoptimized: true },
      env: {},
    }
  : {
      output: "standalone",
    };

const shared: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default { ...nextConfig, ...shared } as NextConfig;
