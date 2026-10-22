"use client";

import type { ComponentType } from "react";

export type IconType = ComponentType<{ className?: string }>;

/* ============ Logo axcsOS (pera con mordida) ============ */
export const PearLogo: IconType = ({ className }) => (
  <svg viewBox="0 0 266 480" className={className} fill="currentColor" fillRule="evenodd" aria-hidden>
    <path d="M187.7,115.0C183.8,115.0 167.1,115.3 162.0,114.9C156.9,114.5 155.0,113.2 153.7,112.5C152.3,111.8 151.5,113.2 153.1,110.3C154.8,107.5 159.7,99.4 164.5,93.3C169.4,87.2 176.4,78.0 185.3,69.7C194.3,61.3 219.3,42.3 224.1,37.7C228.9,33.0 220.0,37.9 217.3,38.8C214.7,39.7 211.2,40.9 206.4,43.7C201.6,46.4 191.8,52.4 185.4,57.3C179.1,62.2 169.9,70.2 163.8,76.3C157.8,82.5 148.1,96.2 145.0,98.1C141.9,100.0 143.2,92.6 143.0,89.0C142.8,85.4 142.9,78.7 143.7,74.0C144.5,69.3 146.6,62.2 148.3,57.8C150.1,53.3 153.2,47.7 155.3,44.3C157.4,41.0 160.0,38.0 162.3,35.5C164.7,33.0 166.7,30.6 171.0,27.7C175.3,24.8 183.8,19.0 191.0,16.2C198.2,13.3 207.9,10.7 218.7,8.8C229.4,6.9 256.2,1.5 262.9,3.3C269.6,5.2 264.0,14.4 263.3,21.1C262.7,27.7 260.2,40.8 258.4,47.7C256.6,54.5 253.6,62.0 251.5,66.7C249.3,71.4 247.1,75.0 244.3,79.0C241.6,83.0 236.2,89.9 233.0,93.1C229.8,96.4 227.4,98.1 223.2,100.7C219.0,103.2 210.3,108.2 205.0,110.3C199.7,112.5 190.3,114.3 187.7,115.0C185.1,115.7 191.5,115.0 187.7,115.0ZM169.3,478.7C167.8,478.6 164.4,479.0 159.3,478.3C154.2,477.6 140.6,474.6 135.3,474.0C130.0,473.4 128.2,473.7 124.0,474.3C119.8,475.0 112.0,477.8 107.3,478.5C102.7,479.1 97.0,479.0 93.0,478.6C89.0,478.3 84.6,477.5 80.3,476.0C76.0,474.6 69.4,471.9 64.3,469.0C59.1,466.1 52.0,462.3 46.0,457.0C40.0,451.7 29.8,441.0 24.5,433.7C19.2,426.4 13.8,415.8 10.7,408.5C7.5,401.1 5.0,392.6 3.7,384.7C2.4,376.7 1.9,362.5 1.9,355.7C2.0,348.8 2.9,343.9 3.9,339.0C4.9,334.1 5.9,329.0 8.4,322.7C10.9,316.4 15.1,306.4 20.6,297.0C26.0,287.6 40.1,267.3 44.9,259.7C49.6,252.1 49.9,251.2 52.1,246.3C54.2,241.5 57.0,235.6 59.2,227.3C61.4,219.1 64.7,200.1 66.9,191.3C69.2,182.5 71.8,174.5 74.3,168.7C76.7,162.9 80.6,156.6 83.5,152.7C86.4,148.7 90.2,145.0 93.5,142.3C96.8,139.7 101.0,137.0 105.7,135.1C110.3,133.1 121.6,130.4 124.6,129.3C127.7,128.2 126.5,131.1 126.2,127.7C125.9,124.3 124.0,112.1 122.6,106.7C121.2,101.2 119.6,96.9 117.0,91.4C114.4,85.8 109.4,75.7 105.3,69.6C101.2,63.5 92.0,54.0 89.7,50.7C87.4,47.4 89.5,48.6 90.0,47.6C90.5,46.6 91.0,45.4 93.0,44.0C95.0,42.6 101.3,39.0 103.3,38.3C105.4,37.6 105.7,38.5 106.7,39.1C107.6,39.8 106.6,36.9 109.5,42.3C112.3,47.8 122.3,67.4 125.8,75.7C129.2,84.0 130.6,89.8 132.5,97.7C134.4,105.6 134.2,122.7 138.4,128.3C142.7,133.9 155.2,132.6 160.7,135.0C166.2,137.3 170.9,140.1 175.0,144.0C179.2,147.9 185.4,155.9 188.5,161.0C191.6,166.1 192.4,167.0 195.5,177.7C198.7,188.4 208.7,222.7 209.2,232.3C209.7,242.0 201.6,239.1 199.0,241.9C196.4,244.6 194.2,247.0 192.1,250.7C189.9,254.3 186.2,262.1 184.8,266.0C183.3,269.9 182.8,273.2 182.5,277.0C182.1,280.8 182.0,286.9 182.4,291.0C182.8,295.1 184.0,300.7 185.1,304.3C186.2,307.9 187.4,311.0 189.9,315.0C192.4,319.0 197.2,326.6 201.7,330.8C206.1,335.0 214.4,340.4 219.4,343.0C224.5,345.6 230.2,347.2 235.3,348.0C240.4,348.8 249.4,348.4 253.3,348.2C257.3,348.0 260.1,346.6 261.7,346.7C263.3,346.9 263.5,344.9 263.9,349.3C264.2,353.8 264.4,369.8 264.0,376.3C263.6,382.9 263.0,386.8 261.2,393.0C259.3,399.2 255.1,411.6 251.9,418.0C248.8,424.4 243.7,431.2 240.2,436.0C236.6,440.8 232.7,445.8 228.2,450.0C223.8,454.2 216.8,460.4 210.5,464.3C204.3,468.2 192.8,473.9 186.7,476.0C180.5,478.2 171.9,478.3 169.3,478.7C166.7,479.1 170.8,478.7 169.3,478.7Z" />
  </svg>
);
/** @deprecated alias — usar PearLogo */
export const AppleLogo = PearLogo;

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
   Rutas relativas al documento: funcionan en / (dev) y /aos/ (GitHub Pages). */
const imgIcon = (src: string): IconType => ({ className }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt="" className={className} draggable={false} />
);

export const FinderLogoIcon = imgIcon("icons/finder.png");
export const AxcGamesLogoIcon = imgIcon("icons/axcgames.png");
export const SafariLogoIcon = imgIcon("icons/safari.png");
export const NotesLogoIcon = imgIcon("icons/notes.png");
export const CalculatorLogoIcon = imgIcon("icons/calculator.png");
export const SettingsLogoIcon = imgIcon("icons/settings.png");

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
