import type { Metadata, Viewport } from "next";
import MirrorSender from "./sender";

/* ============================================================
   /mirror — página emisora de Duplicar pantalla (móvil)
   Página de servidor (exporta metadata) que monta el cliente.
   ============================================================ */

export const metadata: Metadata = {
  title: "Duplicar pantalla · Google Classroom",
  description: "Envía la pantalla o la cámara de tu iPhone al aula virtual.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

export default function MirrorPage() {
  return <MirrorSender />;
}
