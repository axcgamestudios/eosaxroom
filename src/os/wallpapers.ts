export interface Wallpaper {
  id: string;
  name: string;
  /** css background value */
  css: string;
  /** small preview css (same) */
  dark?: boolean;
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: "goldengate",
    name: "Golden Gate",
    css: "url('wallpapers/goldengate.png') center/cover no-repeat",
    dark: true,
  },
  {
    id: "tahoe-dark",
    name: "Tahoe (Oscuro)",
    css: "url('wallpapers/tahoe-dark.png') center/cover no-repeat",
    dark: true,
  },
  {
    id: "tahoe-light",
    name: "Tahoe (Claro)",
    css: "url('wallpapers/tahoe-light.png') center/cover no-repeat",
    dark: false,
  },
  {
    id: "sequoia",
    name: "Sequoia",
    css: "url('wallpapers/sequoia.png') center/cover no-repeat",
    dark: true,
  },
  {
    id: "sonoma",
    name: "Sonoma",
    css: "url('wallpapers/sonoma.png') center/cover no-repeat",
    dark: false,
  },
  {
    id: "grad-liquid",
    name: "Liquid Glass",
    css: "radial-gradient(120% 90% at 15% 10%, #6ee7f9 0%, transparent 45%), radial-gradient(110% 100% at 85% 20%, #7c6cff 0%, transparent 50%), radial-gradient(120% 120% at 80% 90%, #ff6ec7 0%, transparent 45%), radial-gradient(100% 100% at 20% 85%, #2dd4bf 0%, transparent 40%), linear-gradient(160deg, #0f1030 0%, #1b1140 45%, #2b0f3d 100%)",
    dark: true,
  },
  {
    id: "grad-sunset",
    name: "Atardecer",
    css: "radial-gradient(100% 80% at 80% 10%, #ffd28a 0%, transparent 45%), radial-gradient(120% 90% at 15% 25%, #ff7ac3 0%, transparent 50%), radial-gradient(140% 120% at 50% 100%, #5b2a86 0%, transparent 60%), linear-gradient(180deg, #2a1b4e 0%, #7b2d6b 60%, #ff9a6c 100%)",
    dark: true,
  },
  {
    id: "grad-mint",
    name: "Menta",
    css: "radial-gradient(110% 90% at 10% 15%, #b8f2e6 0%, transparent 50%), radial-gradient(120% 100% at 90% 30%, #a7c5ff 0%, transparent 55%), radial-gradient(130% 110% at 60% 100%, #e6ffd6 0%, transparent 55%), linear-gradient(170deg, #eaf7f4 0%, #d3ecf7 55%, #eef7e1 100%)",
    dark: false,
  },
  {
    id: "grad-graphite",
    name: "Grafito",
    css: "radial-gradient(120% 100% at 20% 10%, #3b4252 0%, transparent 55%), radial-gradient(120% 110% at 85% 60%, #2e3440 0%, transparent 55%), linear-gradient(170deg, #21262f 0%, #191d24 60%, #13161c 100%)",
    dark: true,
  },
];

export const DEFAULT_WALLPAPER = "goldengate";

export const CUSTOM_WALLPAPER_ID = "custom";

export function getWallpaper(id: string, customDataUrl?: string): Wallpaper {
  if (id === CUSTOM_WALLPAPER_ID && customDataUrl) {
    return {
      id: CUSTOM_WALLPAPER_ID,
      name: "Personalizado",
      css: `url('${customDataUrl}') center/cover no-repeat`,
      dark: true,
    };
  }
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}

export const ACCENTS: { name: string; value: string }[] = [
  { name: "Azul", value: "#0a84ff" },
  { name: "Púrpura", value: "#bf5af2" },
  { name: "Rosa", value: "#ff375f" },
  { name: "Rojo", value: "#ff453a" },
  { name: "Naranja", value: "#ff9f0a" },
  { name: "Amarillo", value: "#ffd60a" },
  { name: "Verde", value: "#32d74b" },
  { name: "Grafito", value: "#98989d" },
];
