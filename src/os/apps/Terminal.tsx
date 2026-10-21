"use client";

import { useEffect, useRef, useState } from "react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { APPS } from "../registry";
import { PearLogo } from "../icons";

interface Line {
  kind: "input" | "output";
  text: string;
}

const BANNER = `                    'c.
                 ,xNMM.
               .OMMMMo
               lMMM"
     .;loddo:.  .olloddol;.
   CKMMMMMMMMMMMWMMMMMMMMMM0:
 .kMMMMMMMMMMMMMMMMMMMMMMMMWo.
 'XMMMMMMMMMMMMMMMMMMMMMMMMMM.
  MMMMMMMMMMMMMMMMMMMMMMMMMMM.
  MMMMMMMMMMMMMMMMMMMMMMMMMMM:
  MMMMMMMMMMMMMMMMMMMMMMMMMMM:
  .MMMMMMMMMMMMMMMMMMMMMMMMMM
   .MMMMMMMMMMMMMMMMMMMMMMMMM.
    .MMMMMMMMMMMMMMMMMMMMMMMM.
      MMMMMMMMMMMMMMMMMMMMMMM
       ;MMMMMMMMMMMMMMMMMMMM:
        .MMMMMMMMMMMMMMMMMMM.
          .MMMMMMMMMMMMMMMMM.
            oMMMMMMMMMMMMMMM
             oMMMMMMMMMMMMMM
               .loooooool.

  usuario@axcs — axcsOS 1.0
  Chip Z1 Silicon · 16 GB · Liquid Glass`;

export default function TerminalApp({ win }: AppProps) {
  const [lines, setLines] = useState<Line[]>([
    { kind: "output", text: "Última conexión: hoy en tu navegador :)\nEscribe «ayuda» para ver los comandos disponibles." },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openApp = useOS((s) => s.openApp);
  const notify = useOS((s) => s.notify);
  const closeWindow = useOS((s) => s.closeWindow);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const out = (text: string) => setLines((l) => [...l, { kind: "output", text }]);

  const run = (raw: string) => {
    const cmdline = raw.trim();
    setLines((l) => [...l, { kind: "input", text: raw }]);
    if (!cmdline) return;
    setHistory((h) => [cmdline, ...h]);
    setHIdx(-1);
    const [cmd, ...args] = cmdline.split(/\s+/);
    const arg = args.join(" ");

    switch (cmd.toLowerCase()) {
      case "ayuda":
      case "help":
        out(
          "Comandos disponibles:\n" +
            "  ayuda          — esta ayuda\n" +
            "  ls             — listar archivos\n" +
            "  abrir <app>    — abre una aplicación (ej: abrir notas)\n" +
            "  apps           — lista las apps instaladas\n" +
            "  whoami         — usuario actual\n" +
            "  fecha          — fecha y hora\n" +
            "  echo <texto>   — imprime texto\n" +
            "  neofetch       — info del sistema\n" +
            "  claro          — limpia la pantalla\n" +
            "  salir          — cierra la ventana"
        );
        break;
      case "ls":
        out("Aplicaciones  Documentos  Descargas  Escritorio  Imágenes  LÉEME.txt");
        break;
      case "pwd":
        out("/Users/usuario");
        break;
      case "whoami":
        out("usuario — Administrador de este equipo");
        break;
      case "fecha":
      case "date":
        out(new Date().toLocaleString("es-ES", { dateStyle: "full", timeStyle: "medium" }));
        break;
      case "echo":
        out(arg || "");
        break;
      case "apps":
        out(APPS.filter((a) => a.showInLaunchpad !== false).map((a) => `  • ${a.name.toLowerCase().replace(/ /g, "-")}`).join("\n"));
        break;
      case "abrir":
      case "open": {
        const q = arg.toLowerCase().replace(/\.app$/, "");
        const app =
          APPS.find((a) => a.id === q) ??
          APPS.find((a) => a.name.toLowerCase() === q) ??
          APPS.find((a) => a.name.toLowerCase().includes(q) && q.length > 2);
        if (!app) out(`No se encontró la app «${arg}». Prueba con «apps».`);
        else {
          out(`Abriendo ${app.name}…`);
          openApp(app.id);
        }
        break;
      }
      case "neofetch":
        out(BANNER);
        break;
      case "claro":
      case "clear":
        setLines([]);
        return;
      case "sudo":
        out("El usuario no está en el fichero sudoers. Se informará de este incidente. 🍐");
        break;
      case "salir":
      case "exit":
        closeWindow(win.id);
        return;
      default:
        out(`zsh: orden no encontrada: ${cmd}\nEscribe «ayuda» para ver los comandos.`);
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-[#0d0d10]/95 font-mono"
      onClick={() => inputRef.current?.focus()}
    >
      <div ref={scrollRef} className="mac-scrollbar mac-scrollbar-dark min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {lines.map((l, i) => (
          <pre
            key={i}
            className={`os-input whitespace-pre-wrap break-words text-[12px] leading-[1.45] ${
              l.kind === "input" ? "text-emerald-300" : "text-neutral-200"
            }`}
          >
            {l.kind === "input" ? (
              <>
                <span className="text-[#5df58a]">usuario@macbook-web</span>
                <span className="text-neutral-400"> ~ % </span>
                {l.text}
              </>
            ) : (
              l.text
            )}
          </pre>
        ))}
        {/* live input line */}
        <div className="flex items-center gap-1.5 text-[12px]">
          <PearLogo className="h-3.5 w-2 text-neutral-400" />
          <span className="text-[#5df58a]">usuario@macbook-web</span>
          <span className="text-neutral-400">~ %</span>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                run(input);
                setInput("");
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const ni = Math.min(hIdx + 1, history.length - 1);
                if (ni >= 0) { setHIdx(ni); setInput(history[ni]); }
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const ni = hIdx - 1;
                setHIdx(ni);
                setInput(ni >= 0 ? history[ni] : "");
              }
              e.stopPropagation();
            }}
            className="os-input min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white caret-emerald-300 outline-none"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
