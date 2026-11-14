"use client";

import type { ComponentType } from "react";

export type IconType = ComponentType<{ className?: string }>;

/* ============ Logo Apple (silueta oficial) ============ */
export const AppleLogo: IconType = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z" />
  </svg>
);
/** @deprecated alias — usar AppleLogo */
export const PearLogo = AppleLogo;

/* ============ Generic squircle tile ============ */
const Tile = ({
  className,
  children,
  id,
  from,
  to,
  stroke = true,
}: {
  className?: string;
  children?: React.ReactNode;
  id: string;
  from: string;
  to: string;
  stroke?: boolean;
}) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${id})`} />
    {stroke && (
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx="14.5"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />
    )}
    {children}
  </svg>
);

/* ============ Finder ============ */
export const FinderIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="fn-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3ea0ef" />
        <stop offset="1" stopColor="#1a6fd4" />
      </linearGradient>
      <linearGradient id="fn-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#58b7f5" />
        <stop offset="1" stopColor="#2b8ae8" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#fn-a)" />
    <path d="M32 2h15a15 15 0 0 1 15 15v30a15 15 0 0 1-15 15H32V2z" fill="url(#fn-b)" opacity="0.55" />
    {/* face */}
    <path
      d="M17 22c1.6-1.2 4.2-1.2 5.8 0"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M41.2 22c1.6-1.2 4.2-1.2 5.8 0"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M15 40c4 6.5 10 10 17 10s13-3.5 17-10"
      stroke="#fff"
      strokeWidth="2.6"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

/* ============ AXC Games ============ */
export const AxcGamesIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="axc-a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6366f1" />
        <stop offset="0.55" stopColor="#a855f7" />
        <stop offset="1" stopColor="#ec4899" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#axc-a)" />
    <rect
      x="2.5"
      y="2.5"
      width="59"
      height="59"
      rx="14.5"
      fill="none"
      stroke="rgba(255,255,255,0.4)"
      strokeWidth="1"
    />
    {/* controller body */}
    <path
      d="M22.5 21h19c5.2 0 8.6 3.2 9.6 8.2l2.2 12.3c.7 4.4-2.6 7.6-6.6 6.7-3.6-.8-5.4-4.2-8.5-5.8-1.2-.6-2.4-.9-4.2-.9h-4c-1.8 0-3 .3-4.2.9-3.1 1.6-4.9 5-8.5 5.8-4 .9-7.3-2.3-6.6-6.7l2.2-12.3C13.9 24.2 17.3 21 22.5 21z"
      fill="#fff"
      fillOpacity="0.96"
    />
    {/* dpad */}
    <path d="M24.2 29.5h3v-3h2.6v3h3v2.6h-3v3h-2.6v-3h-3z" fill="#7c3aed" />
    {/* action buttons */}
    <circle cx="40.5" cy="29.7" r="1.9" fill="#7c3aed" />
    <circle cx="45.6" cy="33" r="1.9" fill="#ec4899" />
    <circle cx="35.4" cy="33" r="1.9" fill="#ec4899" />
    <circle cx="40.5" cy="36.3" r="1.9" fill="#7c3aed" />
  </svg>
);

/* ============ Safari ============ */
export const SafariIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="sf-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#19b5f2" />
        <stop offset="1" stopColor="#1477cc" />
      </linearGradient>
      <radialGradient id="sf-b" cx="0.5" cy="0.42" r="0.65">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.8" stopColor="#f2f7fb" />
        <stop offset="1" stopColor="#dbe8f2" />
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#sf-a)" />
    <circle cx="32" cy="32" r="25" fill="url(#sf-b)" />
    <circle cx="32" cy="32" r="25" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
    {/* ticks */}
    {Array.from({ length: 24 }).map((_, i) => (
      <rect
        key={i}
        x="31.4"
        y="9.5"
        width="1.2"
        height={i % 6 === 0 ? 4 : 2.4}
        rx="0.6"
        fill="#9fb4c6"
        transform={`rotate(${i * 15} 32 32)`}
      />
    ))}
    {/* needle */}
    <path d="M42.5 21.5 L36.4 36.4 L21.5 42.5 L27.6 27.6 Z" fill="#f64438" />
    <path d="M42.5 21.5 L36.4 36.4 L27.6 27.6 Z" fill="#e02d21" />
    <path d="M21.5 42.5 L27.6 27.6 L36.4 36.4 Z" fill="#dfe9f1" />
  </svg>
);

/* ============ Notes ============ */
export const NotesIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="nt-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffd84d" />
        <stop offset="1" stopColor="#ffb300" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="#fefcf6" />
    <path d="M2 17a15 15 0 0 1 15-15h30a15 15 0 0 1 15 15v3H2z" fill="url(#nt-a)" />
    <rect x="2" y="2" width="60" height="60" rx="15" fill="none" stroke="#e8e0c8" strokeWidth="1" />
    {[30, 38, 46, 54].map((y) => (
      <rect key={y} x="12" y={y} width={y === 54 ? 22 : 40} height="2.4" rx="1.2" fill="#d8d2c0" />
    ))}
  </svg>
);

/* ============ Calculator ============ */
export const CalculatorIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="cl-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a3a3f" />
        <stop offset="1" stopColor="#1d1d20" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#cl-a)" />
    <rect x="10" y="9" width="44" height="10" rx="3" fill="#0f0f11" />
    <text
      x="50"
      y="17.4"
      textAnchor="end"
      fill="#ffffff"
      fontSize="7.5"
      fontFamily="-apple-system, sans-serif"
    >
      0
    </text>
    {[0, 1, 2].map((c) =>
      [0, 1, 2].map((r) => (
        <rect
          key={`${c}-${r}`}
          x={10 + c * 13.5}
          y={23 + r * 11.5}
          width="11"
          height="9"
          rx="2.6"
          fill="#8e8e93"
        />
      ))
    )}
    <rect x="47" y="23" width="11" height="9" rx="2.6" fill="#ff9f0a" />
    <rect x="47" y="34.5" width="11" height="9" rx="2.6" fill="#ff9f0a" />
    <rect x="47" y="46" width="11" height="9" rx="2.6" fill="#ff9f0a" />
    <rect x="33.5" y="46" width="11" height="9" rx="2.6" fill="#8e8e93" />
  </svg>
);

/* ============ Terminal ============ */
export const TerminalIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="tm-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2c2c30" />
        <stop offset="1" stopColor="#111113" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#tm-a)" />
    <rect x="2.5" y="2.5" width="59" height="59" rx="14.5" fill="none" stroke="rgba(255,255,255,0.16)" />
    <path
      d="M16 22l8 8-8 8"
      stroke="#e8ffe8"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <rect x="30" y="38" width="14" height="3.2" rx="1.6" fill="#5df58a" />
  </svg>
);

/* ============ System Settings ============ */
function gearPath(cx: number, cy: number, rOuter: number, rRoot: number, teeth: number): string {
  const pts: string[] = [];
  const N = teeth * 4;
  for (let i = 0; i < N; i++) {
    const seg = i % 4;
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = seg === 1 || seg === 2 ? rOuter : rRoot;
    pts.push(`${(cx + r * Math.cos(ang)).toFixed(2)},${(cy + r * Math.sin(ang)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export const SettingsIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="st-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9d9da4" />
        <stop offset="1" stopColor="#6b6b73" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#st-a)" />
    <g>
      <path d={gearPath(27, 27, 16, 12, 8)} fill="#f2f2f4" />
      <circle cx="27" cy="27" r="5.4" fill="#83838b" />
    </g>
    <g transform="translate(24 24) scale(0.6)">
      <path d={gearPath(27, 27, 16, 12, 8)} fill="#d6d6db" />
      <circle cx="27" cy="27" r="5.4" fill="#83838b" />
    </g>
  </svg>
);

/* ============ Launchpad ============ */
export const LaunchpadIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <rect x="2" y="2" width="60" height="60" rx="15" fill="#f4f5f7" />
    <rect x="2.5" y="2.5" width="59" height="59" rx="14.5" fill="none" stroke="rgba(0,0,0,0.08)" />
    {[
      "#ff5f57",
      "#ff9f0a",
      "#ffd60a",
      "#32d74b",
      "#0a84ff",
      "#5e5ce6",
      "#bf5af2",
      "#ff375f",
      "#8e8e93",
    ].map((c, i) => (
      <rect
        key={c}
        x={11 + (i % 3) * 15}
        y={11 + Math.floor(i / 3) * 15}
        width="12"
        height="12"
        rx="3.4"
        fill={c}
      />
    ))}
  </svg>
);

/* ============ Trash ============ */
export const TrashIcon: IconType = ({ className }) => {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="tr-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9edf2" stopOpacity="0.95" />
          <stop offset="1" stopColor="#b9c2cc" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect x="20" y="10" width="24" height="4" rx="2" fill="#aeb7c2" />
      <rect x="26" y="6" width="12" height="4.5" rx="2" fill="#aeb7c2" />
      <path
        d="M16 18h32l-2.6 36.2c-.2 2.7-2.4 4.8-5.1 4.8H23.7c-2.7 0-4.9-2.1-5.1-4.8z"
        fill="url(#tr-a)"
      />
      <path
        d="M16 18h32l-2.6 36.2c-.2 2.7-2.4 4.8-5.1 4.8H23.7c-2.7 0-4.9-2.1-5.1-4.8z"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1"
      />
      {[26, 32, 38].map((x) => (
        <rect key={x} x={x - 1} y="24" width="2" height="28" rx="1" fill="rgba(120,132,150,0.5)" />
      ))}
    </svg>
  );
};

/* ============ Folder ============ */
export const FolderIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="fd-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fd0f8" />
        <stop offset="1" stopColor="#4aa3e8" />
      </linearGradient>
      <linearGradient id="fd-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a5dcfb" />
        <stop offset="1" stopColor="#63b6ef" />
      </linearGradient>
    </defs>
    <path
      d="M6 16c0-2.2 1.8-4 4-4h13l5 5h20c2.2 0 4 1.8 4 4v3H6z"
      fill="url(#fd-a)"
    />
    <rect x="6" y="20" width="52" height="34" rx="4" fill="url(#fd-b)" />
    <rect x="6" y="20" width="52" height="34" rx="4" fill="none" stroke="rgba(255,255,255,0.5)" />
  </svg>
);

/* ============ Macintosh HD ============ */
export const HDIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="hd-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2f4f7" />
        <stop offset="1" stopColor="#c4cad2" />
      </linearGradient>
    </defs>
    <rect x="8" y="12" width="48" height="40" rx="7" fill="url(#hd-a)" />
    <rect
      x="8.5"
      y="12.5"
      width="47"
      height="39"
      rx="6.5"
      fill="none"
      stroke="rgba(255,255,255,0.8)"
    />
    <circle cx="32" cy="32" r="11" fill="#9aa3ae" />
    <circle cx="32" cy="32" r="11" fill="none" stroke="#7c8590" strokeWidth="1.4" />
    <circle cx="32" cy="32" r="3.4" fill="#e8ecf1" />
  </svg>
);

/* ============ User avatar (login) ============ */
export const AvatarIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="av-a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#22d3ee" />
        <stop offset="0.5" stopColor="#818cf8" />
        <stop offset="1" stopColor="#e879f9" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#av-a)" />
    <circle cx="32" cy="25" r="10" fill="rgba(255,255,255,0.92)" />
    <path
      d="M13 58a19.5 19.5 0 0 1 38 0 30 30 0 0 1-38 0z"
      fill="rgba(255,255,255,0.92)"
    />
  </svg>
);

/* ============ TextEdit (document) ============ */
export const DocIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="dc-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e8eaee" />
      </linearGradient>
    </defs>
    <path
      d="M14 6h24l12 12v40a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"
      fill="url(#dc-a)"
      stroke="#c8ccd4"
    />
    <path d="M38 6v12h12z" fill="#d3d7de" />
    {[26, 34, 42, 50].map((y) => (
      <rect key={y} x="18" y={y} width={y === 50 ? 14 : 28} height="2.6" rx="1.3" fill="#9aa2ad" />
    ))}
    <g transform="rotate(40 44 42)">
      <rect x="41" y="24" width="6" height="28" rx="3" fill="#3b82f6" />
      <rect x="41" y="24" width="6" height="6" rx="3" fill="#1d4ed8" />
    </g>
  </svg>
);

/* ============ Preview (image doc) ============ */
export const ImageDocIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="pv-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e8eaee" />
      </linearGradient>
      <linearGradient id="pv-b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7dd3fc" />
        <stop offset="1" stopColor="#38bdf8" />
      </linearGradient>
    </defs>
    <path
      d="M14 6h24l12 12v40a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"
      fill="url(#pv-a)"
      stroke="#c8ccd4"
    />
    <path d="M38 6v12h12z" fill="#d3d7de" />
    <rect x="15" y="26" width="34" height="24" rx="3" fill="url(#pv-b)" />
    <circle cx="24" cy="33" r="2.6" fill="#fef08a" />
    <path d="M15 47l9-10 7 8 6-6 12 10z" fill="#34d399" />
  </svg>
);

/* ============ AXCGAMES mark (favicon-ish) ============ */
export const AxcMark: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="axm-a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6366f1" />
        <stop offset="0.55" stopColor="#a855f7" />
        <stop offset="1" stopColor="#ec4899" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#axm-a)" />
    <text
      x="32"
      y="43"
      textAnchor="middle"
      fill="#fff"
      fontSize="30"
      fontWeight="800"
      fontFamily="-apple-system, 'SF Pro Display', 'Segoe UI', sans-serif"
    >
      A
    </text>
  </svg>
);

/* ============ Iconos de imagen oficiales de axcgamestudios ============
   Rutas relativas al documento: funcionan en / (dev) y /eosaxroom/ (GitHub Pages).
   Los PNG del estudio son cuadrados: se les da FORMA DE APP (esquinas
   redondeadas tipo squircle de macOS) aquí, de modo que todos los tamaños
   (Dock, Launchpad, Escritorio, Spotlight) la heredan. */
const imgIcon = (src: string): IconType => ({ className }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={src}
    alt=""
    draggable={false}
    className={`rounded-[22%] shadow-sm ring-1 ring-black/10 dark:ring-white/15 ${className ?? ""}`}
  />
);

export const FinderLogoIcon = imgIcon("icons/finder.png");
export const AxcGamesLogoIcon = imgIcon("icons/axcgames.png");
export const SafariLogoIcon = imgIcon("icons/safari.png");
export const NotesLogoIcon = imgIcon("icons/notes.png");
export const CalculatorLogoIcon = imgIcon("icons/calculator.png");
export const SettingsLogoIcon = imgIcon("icons/settings.png");
export const MailLogoIcon = imgIcon("icons/mail.png");
export const AppStoreLogoIcon = imgIcon("icons/appstore.png");
export const TerminalLogoIcon = imgIcon("icons/terminal.png");
export const LaunchpadLogoIcon = imgIcon("icons/launchpad.png");
export const UnityLogoIcon = imgIcon("icons/unity.svg");
export const UnityPlayerLogoIcon = imgIcon("icons/unityplayer.svg");

export const MessagesIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="msgG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5eead4" />
        <stop offset="1" stopColor="#0ea5e9" />
      </linearGradient>
    </defs>
    <rect x="4" y="8" width="56" height="42" rx="14" fill="url(#msgG)" />
    <path d="M20 50 L16 62 L30 52 Z" fill="#0ea5e9" />
    <g fill="#fff">
      <circle cx="22" cy="29" r="4" />
      <circle cx="32" cy="29" r="4" />
      <circle cx="42" cy="29" r="4" />
    </g>
  </svg>
);

/* YouTube: fondo rojo con play, esquinas suaves estilo macOS */
export const YouTubeIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="ytG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff4a45" />
        <stop offset="1" stopColor="#d40000" />
      </linearGradient>
    </defs>
    <rect x="4" y="10" width="56" height="44" rx="12" fill="url(#ytG)" />
    <path d="M27 23.5 L43 32 L27 40.5 Z" fill="#fff" />
  </svg>
);

/* Duplicar pantalla: monitor con ondas de emisión, azul estilo macOS */
export const ScreenMirrorIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="smG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#38bdf8" />
        <stop offset="1" stopColor="#1e40af" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#smG)" />
    {/* pantalla receptora */}
    <rect x="14" y="20" width="36" height="24" rx="4" fill="#fff" opacity="0.96" />
    <rect x="18" y="24" width="28" height="16" rx="2.5" fill="#0b1220" />
    {/* base del monitor */}
    <path d="M26 44h12l2 6H24z" fill="#fff" opacity="0.96" />
    {/* ondas que emanan del móvil hacia arriba */}
    <path d="M30 16.5c2.8 0 5-2.2 5-5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M22.5 15c0-4.6 3.7-8.4 8.4-8.4" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" opacity="0.75" />
    <path d="M40.5 15c0-4.6-3.7-8.4-8.4-8.4" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" opacity="0.75" />
    {/* proyección dentro de la pantalla (mini móvil) */}
    <rect x="29" y="27" width="6" height="10" rx="1.5" fill="#38bdf8" />
  </svg>
);

/* Mail: sobre azul degradado estilo macOS */
export const MailIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="mailG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#38bdf8" />
        <stop offset="1" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <rect x="4" y="12" width="56" height="40" rx="10" fill="url(#mailG)" />
    <path d="M8 20 L32 38 L56 20" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* App Store: los tres palos cruzados formando una A, sobre azul */
export const AppStoreIcon: IconType = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <defs>
      <linearGradient id="asG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#22d3ee" />
        <stop offset="1" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#asG)" />
    <g stroke="#fff" strokeWidth="4.6" strokeLinecap="round" fill="none">
      <path d="M22 44 L31 20" />
      <path d="M42 44 L33 20" />
      <path d="M26.5 36.5 L37.5 36.5" />
    </g>
  </svg>
);
