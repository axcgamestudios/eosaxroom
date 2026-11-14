/* ============================================================
   Mini-C# — intérprete del subconjunto de C# que Unity usa en
   MonoBehaviour. Es el "lenguaje real" del clon de Unity:

   · clases: campos (public/private), métodos con retorno y params
   · tipos: float, int, bool, string, void, Vector3, Color
   · sentencias: if/else, while, for, return, expr, declaración
   · expresiones: aritmética, comparación, lógica, llamada,
     acceso a miembro, indexación mínima, asignación compuesta
   · lifecycle: Start(), Update(), FixedUpdate(), OnCollisionEnter(Collision)
   ============================================================ */

export type CsValue = number | boolean | string | Vector3Val | ColorVal | CsRef | CsListVal | null;
export interface Vector3Val { __vec: true; x: number; y: number; z: number }
export interface ColorVal { __col: true; r: number; g: number; b: number; a: number }
export interface CsListVal { __list: true; items: CsValue[] }
export interface CsRef { __ref: true; obj: CsInstance | HostObject | null; klass?: string }

export const vec3 = (x = 0, y = 0, z = 0): Vector3Val => ({ __vec: true, x, y, z });
export const col = (r = 1, g = 1, b = 1, a = 1): ColorVal => ({ __col: true, r, g, b, a });
export const isVec = (v: unknown): v is Vector3Val => !!v && typeof v === "object" && (v as Vector3Val).__vec === true;
export const isCol = (v: unknown): v is ColorVal => !!v && typeof v === "object" && (v as ColorVal).__col === true;
export const isList = (v: unknown): v is CsListVal => !!v && typeof v === "object" && (v as CsListVal).__list === true;

/* ---------- Host: lo que el runtime expone a los scripts ---------- */
export interface HostObject {
  /** propiedades directas */ get?(name: string): CsValue | undefined;
  set?(name: string, value: CsValue): void;
  /** método */ invoke?(name: string, args: CsValue[]): CsValue | undefined;
  /** indexador Debug.Log etc */ name?: string;
}

/* ---------- Lexer ---------- */
type Tok = { t: "id" | "num" | "str" | "kw" | "op"; v: string; line: number };

const KEYWORDS = new Set([
  "using", "public", "private", "protected", "class", "void", "float", "int", "bool", "string", "var",
  "if", "else", "while", "for", "return", "new", "true", "false", "null", "this", "static", "readonly",
  "Vector3", "Color", "KeyCode", "MonoBehaviour", "GameObject", "Component", "Rigidbody", "Transform",
  "Collision", "Mathf", "Input", "Debug", "Time", "Object", "float3",
]);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1;
  const n = src.length;
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  const push = (t: Tok["t"], v: string) => toks.push({ t, v, line });
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    // comentarios
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    // string
    if (c === '"') {
      i++; let s = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") { const e = src[i + 1]; s += e === "n" ? "\n" : e === "t" ? "\t" : e === '"' ? '"' : e === "\\" ? "\\" : e; i += 2; }
        else { s += src[i]; i++; }
      }
      i++; push("str", s); continue;
    }
    // número (int / float / sufijo f)
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let s = "";
      while (i < n && /[0-9._eE]/.test(src[i])) { s += src[i]; i++; }
      if (i < n && (src[i] === "f" || src[i] === "F")) i++; // sufijo float
      push("num", s.replace(/_/g, "")); continue;
    }
    // identificador / keyword
    if (isIdStart(c)) {
      let s = "";
      while (i < n && isId(src[i])) { s += src[i]; i++; }
      push(KEYWORDS.has(s) || /^[A-Z]/.test(s) && /^[A-Za-z0-9_]+$/.test(s) ? "kw" : "id", s);
      continue;
    }
    // operadores (orden largo primero)
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (three === "<<=" || three === ">>=") { push("op", three); i += 3; continue; }
    if (["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "=>", "::", "??"].includes(two)) { push("op", two); i += 2; continue; }
    if ("+-*/%<>=!&|^~?;:,.(){}[]".includes(c)) { push("op", c); i++; continue; }
    throw new CsError(`Carácter inesperado «${c}»`, line);
  }
  return toks;
}

export class CsError extends Error {
  line: number;
  constructor(msg: string, line: number) { super(`${msg} (línea ${line})`); this.line = line; }
}

/* ---------- AST ---------- */
type Expr =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "null" }
  | { k: "this" }
  | { k: "name"; v: string; line: number }
  | { k: "un"; op: string; e: Expr; line: number; postfix?: boolean }
  | { k: "bin"; op: string; l: Expr; r: Expr; line: number }
  | { k: "asg"; target: Expr; op: string; value: Expr; line: number }
  | { k: "member"; obj: Expr; name: string; line: number }
  | { k: "call"; callee: Expr; args: Expr[]; line: number }
  | { k: "new"; klass: string; args: Expr[]; line: number }
  | { k: "index"; obj: Expr; idx: Expr; line: number }
  | { k: "cond"; c: Expr; a: Expr; b: Expr; line: number }
  | { k: "paren"; e: Expr };

type Stmt =
  | { k: "block"; body: Stmt[] }
  | { k: "vardecl"; names: { name: string; type: string; init?: Expr }[] }
  | { k: "exprstmt"; e: Expr }
  | { k: "if"; c: Expr; then: Stmt; else?: Stmt }
  | { k: "while"; c: Expr; body: Stmt }
  | { k: "for"; init: Stmt | null; cond: Expr | null; post: Expr | null; body: Stmt }
  | { k: "return"; e?: Expr }
  | { k: "break" }
  | { k: "continue" };

type CsMethod = { name: string; params: { name: string; type: string }[]; ret: string; body: Stmt[]; isVoid: boolean };
type CsField = { name: string; type: string; init?: Expr; vis: "public" | "private" };

export class CsClass {
  name: string;
  fields: CsField[] = [];
  methods = new Map<string, CsMethod>();
  constructor(name: string) { this.name = name; }
}

/* ---------- Parser ---------- */
class Parser {
  p = 0;
  constructor(private toks: Tok[]) {}
  peek(o = 0) { return this.toks[this.p + o]; }
  next() { return this.toks[this.p++]; }
  isOp(v: string) { const t = this.peek(); return t && t.t === "op" && t.v === v; }
  isKw(v: string) { const t = this.peek(); return t && (t.t === "kw" || t.t === "id") && t.v === v; }
  eatOp(v: string) { if (!this.isOp(v)) throw new CsError(`Se esperaba «${v}» y llegó «${this.peek()?.v ?? "fin"}»`, this.peek()?.line ?? 0); return this.next(); }
  eatId() { const t = this.next(); if (t.t !== "id" && t.t !== "kw") throw new CsError(`Se esperaba identificador`, t.line); return t.v; }

  parseUsing() { // using UnityEngine; — se ignora (ya está implícito)
    this.next(); this.eatId();
    while (this.isOp(".")) { this.next(); this.eatId(); }
    this.eatOp(";");
  }

  parseClass(): CsClass {
    // [attrs] public class Foo : MonoBehaviour { ... }
    while (this.isOp("[")) { while (!this.isOp("]")) this.next(); this.next(); }
    while (this.isKw("public") || this.isKw("private") || this.isKw("protected") || this.isKw("static") || this.isKw("abstract") || this.isKw("internal") || this.isKw("sealed")) this.next();
    if (!this.isKw("class")) throw new CsError("Se esperaba «class»", this.peek()?.line ?? 0);
    this.next();
    const name = this.eatId();
    const klass = new CsClass(name);
    if (this.isOp(":")) { this.next(); this.eatId(); } // : MonoBehaviour
    this.eatOp("{");
    while (!this.isOp("}")) {
      // campo o método
      let vis: "public" | "private" = "private";
      while (this.isKw("public") || this.isKw("private") || this.isKw("protected") || this.isKw("static") || this.isKw("readonly") || this.isKw("serializable") || this.isKw("const")) {
        if (this.isKw("public")) vis = "public";
        this.next();
      }
      while (this.isOp("[")) { while (!this.isOp("]")) this.next(); this.next(); } // [SerializeField]
      const typeTok = this.next();
      const type = typeTok.v;
      // genéricos GetComponent<T>() en firma? no ocurre en campos
      const member = this.eatId();
      if (this.isOp("(")) {
        // método
        this.next();
        const params: { name: string; type: string }[] = [];
        while (!this.isOp(")")) {
          if (this.isOp(",")) { this.next(); continue; }
          const ptype = this.eatId();
          const pname = this.eatId();
          params.push({ name: pname, type: ptype });
        }
        this.next();
        const body = this.parseBlock();
        klass.methods.set(member, { name: member, params, ret: type, body: body.body, isVoid: type === "void" });
      } else {
        // campo
        const f: CsField = { name: member, type, vis };
        if (this.isOp("=")) { this.next(); f.init = this.parseExpr(); }
        klass.fields.push(f);
        if (this.isOp(";")) this.next();
      }
    }
    this.next();
    return klass;
  }

  parseBlock(): { k: "block"; body: Stmt[] } {
    this.eatOp("{");
    const body: Stmt[] = [];
    while (!this.isOp("}")) body.push(this.parseStmt());
    this.next();
    return { k: "block", body };
  }

  parseStmt(): Stmt {
    const t = this.peek();
    if (t.t === "op" && t.v === "{") return this.parseBlock();
    if (t.t === "op" && t.v === ";") { this.next(); return { k: "block", body: [] }; }
    if (t.t === "kw" || t.t === "id") {
      switch (t.v) {
        case "if": {
          this.next(); this.eatOp("("); const c = this.parseExpr(); this.eatOp(")");
          const then = this.parseStmt();
          let els: Stmt | undefined;
          if (this.isKw("else")) { this.next(); els = this.parseStmt(); }
          return { k: "if", c, then, else: els };
        }
        case "while": {
          this.next(); this.eatOp("("); const c = this.parseExpr(); this.eatOp(")");
          return { k: "while", c, body: this.parseStmt() };
        }
        case "for": {
          this.next(); this.eatOp("(");
          let init: Stmt | null = null;
          if (!this.isOp(";")) init = this.parseStmt();
          else this.next();
          let cond: Expr | null = null;
          if (!this.isOp(";")) cond = this.parseExpr();
          this.eatOp(";");
          let post: Expr | null = null;
          if (!this.isOp(")")) post = this.parseExpr();
          this.eatOp(")");
          return { k: "for", init, cond, post, body: this.parseStmt() };
        }
        case "return": {
          this.next();
          if (this.isOp(";")) { this.next(); return { k: "return" }; }
          const e = this.parseExpr(); this.eatOp(";");
          return { k: "return", e };
        }
        case "break": this.next(); this.eatOp(";"); return { k: "break" };
        case "continue": this.next(); this.eatOp(";"); return { k: "continue" };
        case "var": case "float": case "int": case "bool": case "string": case "Vector3": case "Color": {
          // declaración de variable local (posible múltiple: float a = 1, b = 2;)
          const type = this.next().v;
          const names: { name: string; type: string; init?: Expr }[] = [];
          for (;;) {
            const name = this.eatId();
            let init: Expr | undefined;
            if (this.isOp("=")) { this.next(); init = this.parseExpr(); }
            names.push({ name, type, init });
            if (this.isOp(",")) { this.next(); continue; }
            break;
          }
          this.eatOp(";");
          return { k: "vardecl", names };
        }
      }
      // declaración con tipo custom (GameObject go = ...;) — heurística: Id Id [= expr];
      if (t.t === "kw" && this.peek(1)?.t !== "op" && this.peek(1)?.t !== "kw") {
        // puede ser «Tipo nombre» o «expr stmt» — miramos 2 tokens: si el siguiente es id → decl
        if (this.peek(1) && (this.peek(1).t === "id" || this.peek(1).t === "kw") && (this.peek(2)?.v === "=" || this.peek(2)?.v === ";" || this.peek(2)?.v === "," || this.peek(2)?.v === ".")) {
          const type = this.next().v;
          const names: { name: string; type: string; init?: Expr }[] = [];
          for (;;) {
            const name = this.eatId();
            let init: Expr | undefined;
            if (this.isOp("=")) { this.next(); init = this.parseExpr(); }
            names.push({ name, type, init });
            if (this.isOp(",")) { this.next(); continue; }
            break;
          }
          this.eatOp(";");
          return { k: "vardecl", names };
        }
      }
    }
    const e = this.parseExpr();
    this.eatOp(";");
    return { k: "exprstmt", e };
  }

  /* expresiones con precedencia */
  parseExpr(): Expr { return this.parseAssign(); }
  parseAssign(): Expr {
    const left = this.parseTernary();
    const t = this.peek();
    if (t?.t === "op" && ["=", "+=", "-=", "*=", "/=", "%="].includes(t.v)) {
      this.next();
      const value = this.parseAssign();
      return { k: "asg", target: left, op: t.v, value, line: t.line };
    }
    return left;
  }
  parseTernary(): Expr {
    const c = this.parseBin(0);
    if (this.isOp("?")) {
      this.next(); const a = this.parseAssign(); this.eatOp(":"); const b = this.parseAssign();
      return { k: "cond", c, a, b, line: 0 };
    }
    return c;
  }
  private static PREC = [["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];
  parseBin(level: number): Expr {
    if (level >= Parser.PREC.length) return this.parseUnary();
    let left = this.parseBin(level + 1);
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && Parser.PREC[level].includes(t.v)) {
        this.next();
        const right = this.parseBin(level + 1);
        left = { k: "bin", op: t.v, l: left, r: right, line: t.line };
      } else return left;
    }
  }
  parseUnary(): Expr {
    const t = this.peek();
    if (t?.t === "op" && ["-", "!", "~"].includes(t.v)) { this.next(); return { k: "un", op: t.v, e: this.parseUnary(), line: t.line }; }
    if (t?.t === "op" && (t.v === "++" || t.v === "--")) { this.next(); return { k: "un", op: t.v, e: this.parseUnary(), line: t.line }; }
    return this.parsePostfix();
  }
  parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && t.v === ".") {
        this.next();
        const name = this.eatId();
        // método o campo: se resuelve en runtime
        e = { k: "member", obj: e, name, line: t.line };
      } else if (t?.t === "op" && t.v === "(" && e.k === "member") {
        this.next();
        const args: Expr[] = [];
        while (!this.isOp(")")) {
          if (this.isOp(",")) { this.next(); continue; }
          args.push(this.parseExpr());
        }
        this.next();
        e = { k: "call", callee: e, args, line: t.line };
      } else if (t?.t === "op" && t.v === "[") {
        this.next();
        const idx = this.parseExpr();
        this.eatOp("]");
        e = { k: "index", obj: e, idx, line: t.line };
      } else if (t?.t === "op" && (t.v === "++" || t.v === "--")) {
        this.next();
        e = { k: "un", op: t.v, e, line: t.line, postfix: true };
      } else return e;
    }
  }
  parsePrimary(): Expr {
    const t = this.next();
    if (!t) throw new CsError("Expresión incompleta", 0);
    if (t.t === "num") return { k: "num", v: parseFloat(t.v) };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.v === "true") return { k: "bool", v: true };
    if (t.v === "false") return { k: "bool", v: false };
    if (t.v === "null") return { k: "null" };
    if (t.v === "this") return { k: "this" };
    if (t.v === "new") {
      const klass = this.eatId();
      const args: Expr[] = [];
      if (this.isOp("(")) {
        this.next();
        while (!this.isOp(")")) {
          if (this.isOp(",")) { this.next(); continue; }
          args.push(this.parseExpr());
        }
        this.next();
      }
      return { k: "new", klass, args, line: t.line };
    }
    if (t.t === "op" && t.v === "(") {
      const e = this.parseExpr(); this.eatOp(")");
      return { k: "paren", e };
    }
    if (t.t === "id" || t.t === "kw") return { k: "name", v: t.v, line: t.line };
    throw new CsError(`Token inesperado «${t.v}»`, t.line);
  }
}

/** Compila un fichero .cs a clases (varias clases por fichero como en Unity). */
export function compileCs(src: string): CsClass[] {
  const toks = lex(src);
  const parser = new Parser(toks);
  const classes: CsClass[] = [];
  while (parser.peek()) {
    while (parser.isKw("using")) parser.parseUsing();
    if (!parser.peek()) break;
    classes.push(parser.parseClass());
  }
  return classes;
}

/* ---------- Instancia + evaluación ---------- */
export class CsInstance {
  fields = new Map<string, CsValue>();
  constructor(public klass: CsClass, public host: HostObject) {}
}

type Frame = { vars: Map<string, CsValue>; thisArg: CsInstance | HostObject };

export class Interpreter {
  private stack: Frame[] = [];
  brake = false; cont = false;
  retValue: CsValue | undefined = undefined;
  returning = false;
  /** límite de pasos anti-bucle-infinito */
  private steps = 0;
  constructor(
    /** métodos disponibles de la clase actual (se resuelven por nombre) */
    private methodLookup: (name: string, args: CsValue[]) => { klass: CsClass; self: CsInstance } | null,
    public log: (msg: string) => void,
  ) {}

  runMethod(inst: CsInstance, m: CsMethod, args: CsValue[]): CsValue {
    const frame: Frame = { vars: new Map(), thisArg: inst };
    m.params.forEach((p, i) => frame.vars.set(p.name, (args[i] ?? null) as CsValue));
    this.stack.push(frame);
    this.retValue = undefined;
    this.returning = false;
    try {
      for (const s of m.body) this.exec(s, inst);
    } finally {
      this.stack.pop();
    }
    return this.returning ? (this.retValue ?? null) : null;
  }

  runExpr(inst: CsInstance, e: Expr): CsValue {
    this.stack = [{ vars: new Map(), thisArg: inst }];
    return this.eval(e, inst);
  }

  private frame() { return this.stack[this.stack.length - 1]; }

  private exec(s: Stmt, inst: CsInstance) {
    if (++this.steps > 400_000) throw new CsError("Demasiados pasos: ¿bucle infinito? El editor detiene el script.", 0);
    switch (s.k) {
      case "block": { const f = { vars: new Map(this.frame().vars), thisArg: this.frame().thisArg }; this.stack.push(f); for (const st of s.body) { this.exec(st, inst); if (this.returning || this.brake || this.cont) break; } this.stack.pop(); return; }
      case "vardecl":
        for (const d of s.names) this.frame().vars.set(d.name, d.init ? this.eval(d.init, inst) : defVal(d.type));
        return;
      case "exprstmt": this.eval(s.e, inst); return;
      case "if": if (truthy(this.eval(s.c, inst))) this.exec(s.then, inst); else if (s.else) this.exec(s.else, inst); return;
      case "while": { for (;;) { if (!truthy(this.eval(s.c, inst))) break; this.exec(s.body, inst); if (this.brake) { this.brake = false; break; } if (this.cont) this.cont = false; } return; }
      case "for": {
        if (s.init) this.exec(s.init, inst);
        for (;;) {
          if (s.cond && !truthy(this.eval(s.cond, inst))) break;
          this.exec(s.body, inst);
          if (this.brake) { this.brake = false; break; }
          if (this.cont) this.cont = false;
          if (s.post) this.eval(s.post, inst);
        }
        return;
      }
      case "return": this.retValue = s.e ? this.eval(s.e, inst) : null; this.returning = true; return;
      case "break": this.brake = true; return;
      case "continue": this.cont = true; return;
    }
  }

  private eval(e: Expr, inst: CsInstance): CsValue {
    if (++this.steps > 400_000) throw new CsError("Demasiados pasos: ¿bucle infinito? El editor detiene el script.", 0);
    switch (e.k) {
      case "num": return e.v;
      case "str": return e.v;
      case "bool": return e.v;
      case "null": return null;
      case "this": return { __ref: true, obj: inst, klass: inst.klass.name };
      case "paren": return this.eval(e.e, inst);
      case "name": {
        // orden: local → campo de la instancia → clase estática → propiedades del host (transform, gameObject…)
        const f = this.frame();
        if (f.vars.has(e.v)) return f.vars.get(e.v)!;
        if (inst.fields.has(e.v)) return inst.fields.get(e.v)!;
        const st = staticHost(e.v);
        if (st) return st;
        const hostVal = inst.host?.get?.(e.v);
        if (hostVal !== undefined) return hostVal;
        // podría ser un tipo (ClassName.Method) — se resuelve como estática por nombre
        if (/^[A-Z]/.test(e.v)) return { __ref: true, obj: null, klass: e.v };
        throw new CsError(`No existe «${e.v}» (¿variable, campo o clase?)`, e.line);
      }
      case "un": {
        if (e.postfix) {
          const old = toNum(this.eval(e.e, inst));
          this.assign(e.e, num(old + (e.op === "++" ? 1 : -1)), inst);
          return old;
        }
        const v = this.eval(e.e, inst);
        if (e.op === "!") return !truthy(v);
        if (e.op === "-") return isVec(v) ? vec3(-v.x, -v.y, -v.z) : -toNum(v);
        if (e.op === "~") return ~toNum(v);
        if (e.op === "++" || e.op === "--") { const nv = toNum(v) + (e.op === "++" ? 1 : -1); this.assign(e.e, num(nv), inst); return nv; }
        return v;
      }
      case "bin": {
        const op = e.op;
        if (op === "&&") return truthy(this.eval(e.l, inst)) ? truthy(this.eval(e.r, inst)) : false;
        if (op === "||") return truthy(this.eval(e.l, inst)) ? true : truthy(this.eval(e.r, inst));
        const l = this.eval(e.l, inst), r = this.eval(e.r, inst);
        if (isVec(l) || isVec(r)) {
          if (op === "+") return vecAdd(l, r);
          if (op === "-") return vecSub(l, r);
          // producto con escalar por cualquiera de los lados
          if (op === "*") { const s = isVec(l) ? toNum(r) : toNum(l); const v = (isVec(l) ? l : r) as Vector3Val; return vec3(v.x * s, v.y * s, v.z * s); }
          if (op === "==") return vecEq(l, r);
          return num(vecDot(l, r));
        }
        if (typeof l === "string" || typeof r === "string") {
          if (op === "+") return String(csStr(l)) + String(csStr(r));
          if (op === "==") return csStr(l) === csStr(r);
          if (op === "!=") return csStr(l) !== csStr(r);
        }
        const a = toNum(l), b = toNum(r);
        switch (op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b === 0) throw new CsError("División por cero (float)", e.line); return a / b;
          case "%": return a % b;
          case "==": return a === b;
          case "!=": return a !== b;
          case "<": return a < b;
          case ">": return a > b;
          case "<=": return a <= b;
          case ">=": return a >= b;
          case "&": return (a & b);
          case "|": return (a | b);
          case "^": return (a ^ b);
          case "<<": return (a << b);
          case ">>": return (a >> b);
        }
        return null;
      }
      case "cond": return truthy(this.eval(e.c, inst)) ? this.eval(e.a, inst) : this.eval(e.b, inst);
      case "asg": {
        let v = this.eval(e.value, inst);
        if (e.op !== "=") {
          const cur = this.eval(e.target, inst);
          switch (e.op) {
            case "+=": v = isVec(cur) || isVec(v) ? vecAdd(cur, v) : num(toNum(cur) + toNum(v)); break;
            case "-=": v = isVec(cur) || isVec(v) ? vecSub(cur, v) : num(toNum(cur) - toNum(v)); break;
            case "*=": v = num(toNum(cur) * toNum(v)); break;
            case "/=": v = num(toNum(cur) / toNum(v)); break;
            case "%=": v = num(toNum(cur) % toNum(v)); break;
          }
        }
        this.assign(e.target, v, inst);
        return v;
      }
      case "member": {
        const obj = this.eval(e.obj, inst);
        const res = this.memberOf(obj, e.name);
        if (res === NOT_FOUND) {
          throw new CsError(`«${csTypeName(obj)}» no tiene «${e.name}»`, e.line);
        }
        return res as CsValue;
      }
      case "call": {
        if (e.callee.k === "member") {
          const target = e.callee.obj;
          const memName = (e.callee as { name: string }).name;
          // argumentos evaluados
          const args = e.args.map((a) => this.eval(a, inst));
          // método estático de clase tipada (Mathf.Floor(f) etc.)
          if (target.k === "name") {
            const clsName = target.v;
            const stat = staticCall(clsName, memName, args);
            if (stat !== NOT_FOUND) return stat;
          }
          if (target.k === "new") {
            const obj = this.eval(target, inst);
            const res = this.callOn(obj, memName, args, inst);
            if (res === NOT_FOUND) throw new CsError(`Llamada no válida`, e.line);
            return res;
          }
          const obj = this.eval(target, inst);
          const res = this.callOn(obj, memName, args, inst);
          if (res === NOT_FOUND) {
            // método propio de la instancia C#
            if (isRef(obj) && isCsInstance(obj.obj)) {
              const self = obj.obj as CsInstance;
              const hit = this.methodLookup?.(memName, args);
              if (hit && hit.self === self) {
                const m = hit.klass.methods.get(memName);
                if (m) return this.runMethod(self, m, args);
              }
            }
            throw new CsError(`No existe el método «${memName}» en ${csTypeName(obj)}`, e.line);
          }
          return res;
        }
        // llamada suelta: método de la instancia o constructor
        if (e.callee.k === "name") {
          const args = e.args.map((a) => this.eval(a, inst));
          const hit = this.methodLookup?.(e.callee.v, args);
          if (hit) {
            const m = hit.klass.methods.get(e.callee.v);
            if (m) return this.runMethod(hit.self, m, args);
          }
          throw new CsError(`No existe el método «${e.callee.v}»`, e.line);
        }
        if (e.callee.k === "new") {
          const obj = this.eval(e.callee, inst);
          const memName = (e.callee as { klass: string }).klass;
          const args = e.args.map((a) => this.eval(a, inst));
          const res = this.callOn(obj, memName, args, inst);
          return res === NOT_FOUND ? obj : res;
        }
        throw new CsError("Llamada no soportada", e.line);
      }
      case "new": {
        const args = e.args.map((a) => this.eval(a, inst));
        return this.construct(e.klass, args);
      }
      case "index": {
        const obj = this.eval(e.obj, inst);
        const idx = toNum(this.eval(e.idx, inst));
        if (isList(obj)) return obj.items[Math.trunc(idx)] ?? null;
        throw new CsError("Indexación solo soportada en listas", e.line);
      }
    }
  }

  /** new Vector3(...) / new Color(...) / new GameObject(...) */
  private construct(klass: string, args: CsValue[]): CsValue {
    if (klass === "Vector3") return vec3(toNum(args[0]), toNum(args[1] ?? 0), toNum(args[2] ?? 0));
    if (klass === "Color") {
      if (args.length === 1 && typeof args[0] === "string") { const h = hexColor(String(args[0])); return h; }
      return col(toNum(args[0] ?? 1), toNum(args[1] ?? args[0] ?? 1), toNum(args[2] ?? args[0] ?? 1), toNum(args[3] ?? 1));
    }
    if (klass === "List" || klass === "ArrayList") return { __list: true, items: [] };
    // objeto del host (GameObject.Find etc. llegan por método estático, no por new)
    return { __ref: true, obj: null, klass };
  }

  private memberOf(obj: CsValue, name: string): CsValue | typeof NOT_FOUND {
    if (isRef(obj)) {
      const o = obj.obj;
      if (isCsInstance(o)) {
        if (o.fields.has(name)) return o.fields.get(name)!;
        return NOT_FOUND;
      }
      // propiedades estáticas de clase tipada: Vector3.right, Time.deltaTime, KeyCode.Space…
      if (obj.klass) {
        const st = staticCall(obj.klass, name, []);
        if (st !== NOT_FOUND) return st;
        if (obj.klass === "KeyCode") return name; // KeyCode.Space → "Space"
      }
      const got = o?.get?.(name);
      if (got !== undefined) return got;
      // método sin paréntesis (paso de referencia) — envolvemos
      if (o && typeof o.invoke === "function") return { __ref: true, obj: { invoke: (n: string, a: CsValue[]) => o.invoke!(name, a) } as unknown as HostObject };
      return NOT_FOUND;
    }
    if (isVec(obj)) {
      const v = obj;
      switch (name) {
        case "x": case "y": case "z": return v[name];
        case "normalized": { const l = Math.hypot(v.x, v.y, v.z) || 1; return vec3(v.x / l, v.y / l, v.z / l); }
        case "magnitude": return Math.hypot(v.x, v.y, v.z);
        case "sqrMagnitude": return v.x * v.x + v.y * v.y + v.z * v.z;
      }
      return NOT_FOUND;
    }
    if (typeof obj === "string") {
      if (name === "Length" || name === "length") return obj.length;
      if (name === "ToLower" || name === "ToUpper" || name === "Trim") return { __ref: true, obj: { invoke: () => name === "ToLower" ? obj.toLowerCase() : name === "ToUpper" ? obj.toUpperCase() : obj.trim() } as unknown as HostObject };
      return NOT_FOUND;
    }
    if (typeof obj === "number" || typeof obj === "boolean") return NOT_FOUND;
    if (obj === null) return NOT_FOUND;
    // host object desnudo
    const got = (obj as HostObject)?.get?.(name);
    return got === undefined ? NOT_FOUND : got;
  }
  private callOn(obj: CsValue, name: string, args: CsValue[], inst: CsInstance): CsValue | typeof NOT_FOUND {
    if (isRef(obj)) {
      const o = obj.obj;
      if (isCsInstance(o)) {
        // método de otra instancia del mismo/runtime — delega al lookup
        const hit = this.methodLookup?.(name, args);
        if (hit && hit.self === o) {
          const m = hit.klass.methods.get(name);
          if (m) return this.runMethod(o, m, args);
        }
        return NOT_FOUND;
      }
      const r = o?.invoke?.(name, args);
      return r === undefined ? NOT_FOUND : r;
    }
    if (isVec(obj)) {
      if (name === "ToString") return `(${obj.x}, ${obj.y}, ${obj.z})`;
      if (name === "Set" || name === "set") { const [x, y, z] = args.map(toNum); (obj as mutableVec).x = x; (obj as mutableVec).y = y; (obj as mutableVec).z = z; return obj; }
      if (name === "Scale") { const o = toVec(args[0]); (obj as mutableVec).x *= o.x; (obj as mutableVec).y *= o.y; (obj as mutableVec).z *= o.z; return obj; }
      if (name === "Normalize") { const l = Math.hypot(obj.x, obj.y, obj.z) || 1; const m = obj as mutableVec; m.x /= l; m.y /= l; m.z /= l; return obj; }
      return NOT_FOUND;
    }
    if (typeof obj === "string") {
      if (name === "ToString") return obj;
      if (name === "Contains") return obj.includes(csStr(args[0]));
      if (name === "Substring") return obj.substring(toNum(args[0]), args[1] !== undefined ? toNum(args[1]) + toNum(args[0]) : undefined);
      if (name === "IndexOf") return obj.indexOf(csStr(args[0]));
      if (name === "Equals") return obj === csStr(args[0]);
      return NOT_FOUND;
    }
    if (typeof obj === "number") {
      if (name === "ToString") return fmtFloat(obj);
      return NOT_FOUND;
    }
    const r = (obj as HostObject | null)?.invoke?.(name, args);
    return r === undefined ? NOT_FOUND : r;
  }

  private assign(target: Expr, value: CsValue, inst: CsInstance) {
    switch (target.k) {
      case "name": {
        const f = this.frame();
        if (f.vars.has(target.v)) { f.vars.set(target.v, value); return; }
        if (inst.fields.has(target.v)) { inst.fields.set(target.v, value); return; }
        throw new CsError(`No existe «${target.v}» para asignar`, (target as { line: number }).line ?? 0);
      }
      case "member": {
        const obj = this.eval(target.obj, inst);
        if (isRef(obj)) {
          const o = obj.obj;
          if (isCsInstance(o)) { o.fields.set(target.name, value); return; }
          o?.set?.(target.name, value);
          return;
        }
        if (isVec(obj)) { (obj as mutableVec)[target.name as "x" | "y" | "z"] = toNum(value); return; }
        (obj as HostObject | null)?.set?.(target.name, value);
        return;
      }
      case "index": {
        const obj = this.eval(target.obj, inst);
        const idx = Math.trunc(toNum(this.eval(target.idx, inst)));
        if (isList(obj)) { obj.items[idx] = value; return; }
        return;
      }
      default:
        throw new CsError("Destino de asignación no válido", 0);
    }
  }
}

/* ---------- estáticas de Unity (Mathf, Input, Debug, Time, Vector3, KeyCode…) ---------- */
const NOT_FOUND = Symbol("not-found");
type StaticsFn = (name: string, args: CsValue[]) => CsValue | typeof NOT_FOUND;

const V3STATICS: Record<string, () => Vector3Val> = {
  zero: () => vec3(0, 0, 0),
  one: () => vec3(1, 1, 1),
  up: () => vec3(0, 1, 0),
  down: () => vec3(0, -1, 0),
  right: () => vec3(1, 0, 0),
  left: () => vec3(-1, 0, 0),
  forward: () => vec3(0, 0, 1),
  back: () => vec3(0, 0, -1),
  positiveInfinity: () => vec3(Infinity, Infinity, Infinity),
  negativeInfinity: () => vec3(-Infinity, -Infinity, -Infinity),
};

const COLSTATICS: Record<string, () => ColorVal> = {
  white: () => col(1, 1, 1, 1), black: () => col(0, 0, 0, 1), red: () => col(1, 0, 0, 1),
  green: () => col(0, 1, 0, 1), blue: () => col(0, 0, 1, 1), yellow: () => col(1, 0.92, 0.016, 1),
  clear: () => col(0, 0, 0, 0), gray: () => col(0.5, 0.5, 0.5, 1), cyan: () => col(0, 1, 1, 1),
  magenta: () => col(1, 0, 1, 1),
};

export interface StaticCtx {
  input: {
    axis: (name: string) => number;
    key: (code: string) => boolean;
    keyDown: (code: string) => boolean;
    mousePos: () => Vector3Val;
    mouse0: () => boolean;
  };
  time: { deltaTime: number; time: number; frameCount: number };
  debugLog: (msg: string) => void;
  /** objeto del juego: crear/encontrar/destruir/instancia */
  gameObjects: {
    create: (name: string) => CsValue;
    find: (name: string) => CsValue;
    destroy: (obj: CsValue) => void;
    instantiate: (obj: CsValue, pos?: Vector3Val, rot?: Vector3Val) => CsValue;
    findObjectOfType: (type: string) => CsValue;
    tag: (tag: string) => CsValue;
  };
  /** físicas: raycast simple */
  physics: { raycast: (origin: Vector3Val, dir: Vector3Val, maxDist: number) => CsValue };
  /** random con semilla del runtime */
  random: { range: (a: number, b: number) => number; value: () => number; insideUnitSphere: () => Vector3Val };
  /** escena activa: cargar */
  loadScene?: (name: string) => void;
}

let STATIC_CTX: StaticCtx | null = null;
export function setStaticCtx(ctx: StaticCtx) { STATIC_CTX = ctx; }
export function getStaticCtx(): StaticCtx | null { return STATIC_CTX; }

function staticHost(name: string): CsValue | null {
  switch (name) {
    case "Mathf": case "Input": case "Debug": case "Time": case "Vector3": case "Color":
    case "GameObject": case "KeyCode": case "Physics": case "Random": case "SceneManager":
      return { __ref: true, obj: STATIC_MARKER, klass: name };
  }
  return null;
}
const STATIC_MARKER = {} as HostObject;

function staticCall(cls: string, name: string, args: CsValue[]): CsValue | typeof NOT_FOUND {
  const ctx = STATIC_CTX;
  const n = (v: CsValue) => toNum(v);
  switch (`${cls}.${name}`) {
    /* ---- Mathf ---- */
    case "Mathf.Abs": return Math.abs(n(args[0]));
    case "Mathf.Sign": return Math.sign(n(args[0]));
    case "Mathf.Floor": return Math.floor(n(args[0]));
    case "Mathf.Ceil": return Math.ceil(n(args[0]));
    case "Mathf.Round": return Math.round(n(args[0]));
    case "Mathf.Min": return Math.min(...args.map(n));
    case "Mathf.Max": return Math.max(...args.map(n));
    case "Mathf.Clamp": { const v = n(args[0]); return Math.min(Math.max(v, n(args[1])), n(args[2])); }
    case "Mathf.Clamp01": return Math.min(Math.max(n(args[0]), 0), 1);
    case "Mathf.Lerp": { const a = n(args[0]), b = n(args[1]); return a + (b - a) * n(args[2]); }
    case "Mathf.LerpAngle": { const a = n(args[0]), b = n(args[1]); let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * n(args[2]); }
    case "Mathf.Pow": return Math.pow(n(args[0]), n(args[1]));
    case "Mathf.Sqrt": return Math.sqrt(n(args[0]));
    case "Mathf.Sin": return Math.sin(n(args[0]));
    case "Mathf.Cos": return Math.cos(n(args[0]));
    case "Mathf.Tan": return Math.tan(n(args[0]));
    case "Mathf.Atan": return Math.atan(n(args[0]));
    case "Mathf.Atan2": return Math.atan2(n(args[0]), n(args[1]));
    case "Mathf.Deg2Rad": return Math.PI / 180;
    case "Mathf.Rad2Deg": return 180 / Math.PI;
    case "Mathf.PI": return Math.PI;
    case "Mathf.Infinity": return Infinity;
    case "Mathf.Epsilon": return Number.EPSILON;
    case "Mathf.Approximately": return Math.abs(n(args[0]) - n(args[1])) < 1e-6;
    case "Mathf.Repeat": { const t = n(args[0]), l = n(args[1]); return ((t % l) + l) % l; }
    case "Mathf.MoveTowards": { const a = n(args[0]), b = n(args[1]); const d = n(args[2]); return Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d; }
    /* ---- Vector3 ---- */
    case "Vector3.Dot": return vecDot(toVec(args[0]), toVec(args[1]));
    case "Vector3.Cross": { const a = toVec(args[0]), b = toVec(args[1]); return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    case "Vector3.Distance": { const a = toVec(args[0]), b = toVec(args[1]); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    case "Vector3.Angle": { const a = toVec(args[0]), b = toVec(args[1]); const d = vecDot(a, b) / ((Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)) || 1); return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI; }
    case "Vector3.Lerp": { const a = toVec(args[0]), b = toVec(args[1]); const t = n(args[2]); return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
    case "Vector3.MoveTowards": { const a = toVec(args[0]), b = toVec(args[1]); const max = n(args[2]); const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); if (d <= max || d === 0) return vec3(b.x, b.y, b.z); const t = max / d; return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
    case "Vector3.Normalize": { const a = toVec(args[0]); const l = Math.hypot(a.x, a.y, a.z) || 1; return vec3(a.x / l, a.y / l, a.z / l); }
    case "Vector3.Scale": { const a = toVec(args[0]), b = toVec(args[1]); return vec3(a.x * b.x, a.y * b.y, a.z * b.z); }
    case "Vector3.Magnitude": { const a = toVec(args[0]); return Math.hypot(a.x, a.y, a.z); }
    case "Vector3.SqrMagnitude": { const a = toVec(args[0]); return a.x * a.x + a.y * a.y + a.z * a.z; }
    case "Vector3.Max": { const a = toVec(args[0]), b = toVec(args[1]); return vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)); }
    case "Vector3.Min": { const a = toVec(args[0]), b = toVec(args[1]); return vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)); }
    /* ---- Input ---- */
    case "Input.GetAxis": return ctx ? ctx.input.axis(String(args[0] ?? "")) : 0;
    case "Input.GetAxisRaw": { const v = ctx ? ctx.input.axis(String(args[0] ?? "")) : 0; return v > 0 ? 1 : v < 0 ? -1 : 0; }
    case "Input.GetKey": return ctx ? ctx.input.key(String(args[0] ?? "")) : false;
    case "Input.GetKeyDown": return ctx ? ctx.input.keyDown(String(args[0] ?? "")) : false;
    case "Input.GetMouseButton": return ctx ? ctx.input.mouse0() : false;
    case "Input.mousePosition": return ctx ? ctx.input.mousePos() : vec3();
    /* ---- Time ---- */
    case "Time.deltaTime": return ctx?.time.deltaTime ?? 0;
    case "Time.time": return ctx?.time.time ?? 0;
    case "Time.frameCount": return ctx?.time.frameCount ?? 0;
    /* ---- Debug ---- */
    case "Debug.Log": { ctx?.debugLog(csStr(args[0])); return null; }
    case "Debug.LogWarning": { ctx?.debugLog(`⚠ ${csStr(args[0])}`); return null; }
    case "Debug.LogError": { ctx?.debugLog(`✕ ${csStr(args[0])}`); return null; }
    /* ---- GameObject ---- */
    case "GameObject.Find": return ctx ? (ctx.gameObjects.find(String(args[0] ?? "")) ?? null) : null;
    case "GameObject.FindGameObjectWithTag": return ctx ? (ctx.gameObjects.tag(String(args[0] ?? "")) ?? null) : null;
    case "GameObject.FindObjectOfType": return ctx ? (ctx.gameObjects.findObjectOfType(String(args[0] ?? "")) ?? null) : null;
    /* ---- Physics ---- */
    case "Physics.Raycast": { const o = toVec(args[0]); const d = toVec(args[1]); return ctx ? (ctx.physics.raycast(o, d, n(args[2]) || Infinity) ?? null) : null; }
    /* ---- Random ---- */
    case "Random.Range": return ctx ? ctx.random.range(n(args[0]), n(args[1])) : 0;
    case "Random.value": return ctx ? ctx.random.value() : 0;
    case "Random.insideUnitSphere": return ctx ? ctx.random.insideUnitSphere() : vec3();
    /* ---- SceneManager ---- */
    case "SceneManager.LoadScene": ctx?.loadScene?.(String(args[0] ?? "")); return null;
  }
  // propiedades estáticas (sin argumentos)
  if (cls === "Vector3" && V3STATICS[name]) return V3STATICS[name]();
  if (cls === "Color" && COLSTATICS[name]) return COLSTATICS[name]();
  return NOT_FOUND;
}

/* ---------- helpers de valores ---------- */
export function isCsInstance(o: unknown): o is CsInstance { return o instanceof CsInstance; }
export function isRef(v: unknown): v is CsRef { return !!v && typeof v === "object" && (v as CsRef).__ref === true; }
export const num = (v: number): number => v;
export const toNum = (v: CsValue): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isVec(v)) throw new CsError("Se esperaba float y llegó Vector3 (¿querías .x?)", 0);
  return 0;
};
export const toVec = (v: CsValue): Vector3Val => {
  if (isVec(v)) return v;
  if (typeof v === "number") return vec3(v, v, v);
  return vec3();
};
export const truthy = (v: CsValue): boolean => v !== null && v !== false && v !== 0 && v !== "" && v !== undefined;
export const csTypeName = (v: CsValue): string => {
  if (v === null || v === undefined) return "null";
  if (isRef(v)) return v.klass ?? "objeto";
  if (isCsInstance(v)) return "instancia";
  if (isVec(v)) return "Vector3";
  if (isCol(v)) return "Color";
  if (typeof v === "number") return "float";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return "string";
  return "objeto";
};
export const csStr = (v: CsValue): string => {
  if (v === null || v === undefined) return "null";
  if (isVec(v)) return `(${fmtFloat(v.x)}, ${fmtFloat(v.y)}, ${fmtFloat(v.z)})`;
  if (typeof v === "number") return fmtFloat(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  return String(v);
};
export const fmtFloat = (v: number): string => Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
const vecAdd = (l: CsValue, r: CsValue): Vector3Val => { const a = toVec(l), b = toVec(r); return vec3(a.x + b.x, a.y + b.y, a.z + b.z); };
const vecSub = (l: CsValue, r: CsValue): Vector3Val => { const a = toVec(l), b = toVec(r); return vec3(a.x - b.x, a.y - b.y, a.z - b.z); };
const vecDot = (l: CsValue, r: CsValue): number => { const a = toVec(l), b = toVec(r); return a.x * b.x + a.y * b.y + a.z * b.z; };
const vecEq = (l: CsValue, r: CsValue): boolean => { const a = toVec(l), b = toVec(r); return a.x === b.x && a.y === b.y && a.z === b.z; };
const defVal = (type: string): CsValue => {
  switch (type) { case "int": case "float": case "double": return 0; case "bool": return false; case "string": return ""; case "Vector3": return vec3(); case "Color": return col(); default: return null; }
};
const hexColor = (hex: string): ColorVal => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return col();
  const h = m[1];
  return col(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1);
};
type mutableVec = { x: number; y: number; z: number };
