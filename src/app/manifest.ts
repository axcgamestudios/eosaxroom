import type { MetadataRoute } from "next";

// Necesario para el export estático (GitHub Pages): la ruta del manifest
// debe marcarse como estática.
export const dynamic = "force-static";

/**
 * Manifest de la app instalable.
 * Rutas RELATIVAS (sin barra inicial): así el mismo manifest sirve tanto en
 * GitHub Pages (https://axcgamestudios.github.io/eosaxroom/) como en el
 * despliegue standalone (raíz del dominio), porque se resuelven contra la
 * URL donde se sirve este manifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Google Classroom",
    short_name: "Classroom",
    description:
      "Google Classroom: plataforma educativa para gestionar clases, tareas y comunicación entre profesores y estudiantes.",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18a15e",
    icons: [
      {
        src: "icons/classroom-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/classroom-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
