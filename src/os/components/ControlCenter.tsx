"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Airplay,
  Bluetooth,
  Moon,
  Music,
  ScreenShare,
  Sun,
  Volume2,
  Wifi,
} from "lucide-react";
import { useOS } from "../store";

function Tile({
  on,
  icon: Icon,
  label,
  sub,
  onClick,
  wide,
}: {
  on: boolean;
  icon: React.ElementType;
  label: string;
  sub?: string;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition ${
        wide ? "col-span-2" : ""
      } ${on ? "bg-[var(--accent-os)] text-white shadow-sm" : "bg-black/6 text-neutral-700 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/15"}`}
    >
      <span
        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${
          on ? "bg-white/25" : "bg-black/8 dark:bg-white/12"
        }`}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium leading-tight">{label}</span>
        {sub && <span className="block truncate text-[10.5px] leading-tight opacity-70">{sub}</span>}
      </span>
    </button>
  );
}

export default function ControlCenter() {
  const open = useOS((s) => s.controlCenterOpen);
  const setControlCenter = useOS((s) => s.setControlCenter);
  const sys = useOS((s) => s.sys);
  const setSys = useOS((s) => s.setSys);
  const appearance = useOS((s) => s.settings.appearance);
  const update = useOS((s) => s.updateSettings);
  const notify = useOS((s) => s.notify);

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[4470]" onMouseDown={() => setControlCenter(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.09 } }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            style={{ transformOrigin: "top right" }}
            className="glass lg-specular fixed right-2 top-[34px] z-[4480] w-[300px] rounded-2xl p-2.5 text-neutral-800 shadow-2xl"
          >
            {/* connectivity */}
            <div className="grid grid-cols-2 gap-2">
              <Tile
                on={sys.wifi}
                icon={Wifi}
                label="Wi-Fi"
                sub={sys.wifi ? "Casa 5G" : "Desactivado"}
                onClick={() => setSys({ wifi: !sys.wifi })}
              />
              <Tile
                on={sys.bluetooth}
                icon={Bluetooth}
                label="Bluetooth"
                sub={sys.bluetooth ? "Activado" : "Desactivado"}
                onClick={() => setSys({ bluetooth: !sys.bluetooth })}
              />
              <Tile
                on={sys.airdrop}
                icon={Airplay}
                label="AirDrop"
                sub={sys.airdrop ? "Para todos" : "Desactivado"}
                onClick={() => setSys({ airdrop: !sys.airdrop })}
              />
              <Tile
                on={sys.dnd}
                icon={Moon}
                label="No molestar"
                sub={sys.dnd ? "Activado" : "Desactivado"}
                onClick={() => setSys({ dnd: !sys.dnd })}
              />
            </div>

            {/* appearance row */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Tile
                on={appearance === "dark"}
                icon={Moon}
                label="Oscuro"
                sub="Apariencia"
                onClick={() => update({ appearance: appearance === "dark" ? "light" : "dark" })}
              />
              <Tile
                on={sys.stageManager}
                icon={ScreenShare}
                label="Stage Manager"
                sub={sys.stageManager ? "Activado" : "Desactivado"}
                onClick={() => {
                  setSys({ stageManager: !sys.stageManager });
                  notify("settings", "Stage Manager", sys.stageManager ? "Stage Manager desactivado." : "Stage Manager activado (visual).");
                }}
              />
            </div>

            {/* sliders */}
            <div className="mt-2 rounded-xl bg-black/6 p-2.5 dark:bg-white/10">
              <div className="flex items-center gap-2.5">
                <Sun size={14} className="shrink-0 text-amber-500" />
                <input
                  type="range"
                  min={35}
                  max={100}
                  value={sys.brightness}
                  onChange={(e) => setSys({ brightness: Number(e.target.value) })}
                  className="h-1.5 w-full accent-white"
                  aria-label="Brillo"
                />
              </div>
            </div>
            <div className="mt-2 rounded-xl bg-black/6 p-2.5 dark:bg-white/10">
              <div className="flex items-center gap-2.5">
                <Volume2 size={14} className="shrink-0 text-[var(--accent-os)]" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sys.volume}
                  onChange={(e) => setSys({ volume: Number(e.target.value) })}
                  className="h-1.5 w-full accent-white"
                  aria-label="Volumen"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-xl bg-black/6 px-3 py-2 text-[12px] font-medium text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
              <span className="flex items-center gap-2">
                <Music size={13} /> Sonido
              </span>
              <span className="text-[10.5px] text-neutral-400">Salida: Altavoces del Mac</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
