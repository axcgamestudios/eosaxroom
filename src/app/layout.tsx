import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Google Classroom",
  description:
    "Google Classroom: plataforma educativa para gestionar clases, tareas y comunicación entre profesores y estudiantes.",
  applicationName: "Google Classroom",
};

export const viewport: Viewport = {
  themeColor: "#18a15e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Auto-reparación de versiones obsoletas: cuando el navegador tiene
            una página cacheada de un despliegue anterior, los chunks con hash
            que ya no existen fallan ("Failed to load chunk"). Aquí se detecta
            y se recarga UNA vez con parámetro anti-caché para traer el HTML
            nuevo. Con tope de 60 s para no entrar en bucles. */}
        <Script id="chunk-selfheal" strategy="beforeInteractive">
          {`(function(){var K="axcsHealTs";function isErr(m){return typeof m==="string"&&/Loading chunk|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(m)}function heal(){try{var last=+sessionStorage.getItem(K)||0;if(Date.now()-last<6e4)return;sessionStorage.setItem(K,""+Date.now())}catch(e){return}var u=location.href;location.replace(u+(u.indexOf("?")>=0?"&":"?")+"_heal="+Date.now())}window.addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="SCRIPT"&&t.src&&/_next\\/|vendor\\//.test(t.src)){heal();return}isErr(e&&e.message)&&heal()});window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;isErr(r&&r.message)&&heal()})})();`}
        </Script>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
