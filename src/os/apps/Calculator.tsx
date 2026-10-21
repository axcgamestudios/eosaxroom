"use client";

import { useEffect, useState } from "react";

type Op = "+" | "−" | "×" | "÷" | null;

function fmt(n: number): string {
  if (!isFinite(n)) return "Error";
  const s =
    Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-9 && n !== 0)
      ? n.toExponential(6)
      : String(Math.round(n * 1e10) / 1e10);
  return s.length > 12 ? Number(n.toPrecision(10)).toString() : s;
}

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case "+": return a + b;
    case "−": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? NaN : a / b;
    default: return b;
  }
}

function CalcButton({
  label,
  variant = "num",
  wide = false,
  pressed,
  onDown,
}: {
  label: string;
  variant?: "num" | "op" | "fn";
  wide?: boolean;
  pressed: boolean;
  onDown: () => void;
}) {
  return (
    <button
      onPointerDown={onDown}
      className={`flex h-full select-none items-center justify-center rounded-full text-[17px] font-normal transition-all duration-75 ${
        wide ? "col-span-2" : ""
      } ${
        variant === "op"
          ? "bg-[#ff9f0a] text-white " + (pressed ? "brightness-125" : "hover:brightness-110")
          : variant === "fn"
            ? "bg-[#5c5c5f]/90 text-white " + (pressed ? "brightness-125" : "hover:brightness-125")
            : "bg-[#333336]/90 text-white " + (pressed ? "brightness-150" : "hover:brightness-125")
      }`}
    >
      {label}
    </button>
  );
}

export default function CalculatorApp() {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(true);
  const [pressed, setPressed] = useState<string | null>(null);

  const press = (key: string, fn: () => void) => {
    setPressed(key);
    setTimeout(() => setPressed(null), 110);
    fn();
  };

  const inputDigit = (d: string) => {
    if (fresh) {
      setDisplay(d === "," ? "0," : d);
      setFresh(false);
    } else if (display.replace(/[−,]/g, "").length < 10) {
      setDisplay((v) => (d === "," && v.includes(",") ? v : v + d));
    }
  };

  const compute = (nextOp: Op) => {
    const cur = parseFloat(display.replace(",", "."));
    if (acc === null) {
      setAcc(cur);
    } else if (op) {
      const r = apply(acc, cur, op);
      setAcc(r);
      setDisplay(fmt(r));
    }
    setOp(nextOp);
    setFresh(true);
  };

  const equals = () => {
    if (acc === null || !op) return;
    const cur = parseFloat(display.replace(",", "."));
    const r = apply(acc, cur, op);
    setDisplay(fmt(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const clear = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key, () => inputDigit(e.key));
      else if (e.key === "." || e.key === ",") press(",", () => inputDigit(","));
      else if (e.key === "+") press("+", () => compute("+"));
      else if (e.key === "-") press("−", () => compute("−"));
      else if (e.key === "*") press("×", () => compute("×"));
      else if (e.key === "/") {
        e.preventDefault();
        press("÷", () => compute("÷"));
      } else if (e.key === "Enter" || e.key === "=") press("=", equals);
      else if (e.key === "Escape") press("C", clear);
      else if (e.key === "Backspace")
        press("⌫", () => setDisplay((v) => (v.length > 1 ? v.slice(0, -1) : "0")));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind every render to keep closures fresh

  return (
    <div className="flex h-full flex-col bg-[#1c1c1e] p-1.5 pt-0">
      <div className="flex h-[72px] shrink-0 items-end justify-end px-4 pb-1.5">
        <span
          className={`font-light tabular-nums text-white ${
            display.length > 8 ? "text-[26px]" : "text-[38px]"
          }`}
        >
          {display}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-1.5">
        <CalcButton label="C" variant="fn" pressed={pressed === "C"} onDown={() => press("C", clear)} />
        <CalcButton
          label="±"
          variant="fn"
          pressed={pressed === "±"}
          onDown={() =>
            press("±", () =>
              setDisplay((v) => (v.startsWith("−") ? v.slice(1) : v === "0" ? "0" : "−" + v))
            )
          }
        />
        <CalcButton
          label="%"
          variant="fn"
          pressed={pressed === "%"}
          onDown={() =>
            press("%", () => setDisplay((v) => fmt(parseFloat(v.replace(",", ".")) / 100)))
          }
        />
        <CalcButton label="÷" variant="op" pressed={pressed === "÷"} onDown={() => press("÷", () => compute("÷"))} />
        {["7", "8", "9"].map((d) => (
          <CalcButton key={d} label={d} pressed={pressed === d} onDown={() => press(d, () => inputDigit(d))} />
        ))}
        <CalcButton label="×" variant="op" pressed={pressed === "×"} onDown={() => press("×", () => compute("×"))} />
        {["4", "5", "6"].map((d) => (
          <CalcButton key={d} label={d} pressed={pressed === d} onDown={() => press(d, () => inputDigit(d))} />
        ))}
        <CalcButton label="−" variant="op" pressed={pressed === "−"} onDown={() => press("−", () => compute("−"))} />
        {["1", "2", "3"].map((d) => (
          <CalcButton key={d} label={d} pressed={pressed === d} onDown={() => press(d, () => inputDigit(d))} />
        ))}
        <CalcButton label="+" variant="op" pressed={pressed === "+"} onDown={() => press("+", () => compute("+"))} />
        <CalcButton label="0" wide pressed={pressed === "0"} onDown={() => press("0", () => inputDigit("0"))} />
        <CalcButton label="," pressed={pressed === ","} onDown={() => press(",", () => inputDigit(","))} />
        <CalcButton label="=" variant="op" pressed={pressed === "="} onDown={() => press("=", equals)} />
      </div>
    </div>
  );
}
