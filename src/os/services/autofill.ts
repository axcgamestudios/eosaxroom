"use client";

/* ============================================================
   Motor de autocompletado e inicio de sesión de axcsOS
   ------------------------------------------------------------
   Detecta formularios de acceso en las páginas cargadas dentro
   del navegador (las del motor son MISMO ORIGEN: su DOM es
   legible), rellena el CORREO VERIFICADO del perfil (AXC ID) y
   las contraseñas guardadas en la bóveda (vault.ts, AES-256-GCM),
   captura credenciales nuevas al enviar el formulario y propone
   guardarlas. En páginas cross-origin (modo directo externo) el
   relleno es imposible: se copia el correo al portapapeles con
   aviso honesto. Nunca se finge una capacidad que no existe.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useOS } from "../store";
import { getAxcid } from "./axcid";
import { mailAddress } from "./mail";
import { domainOf, findVaultEntry, getCredential, isNeverSave, saveCredential, neverSaveAgain } from "./vault";

/* ---------- detección de campos (compatible con frameworks) ---------- */

const NON_TEXT_TYPES = new Set(["hidden", "checkbox", "radio", "button", "submit", "file", "range", "color", "image", "number"]);

function fieldMeta(el: HTMLInputElement): string {
  return `${el.name ?? ""} ${el.id ?? ""} ${el.placeholder ?? ""} ${el.getAttribute("autocomplete") ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
}

/** ¿un campo que espera un correo? */
export function isEmailField(el: HTMLInputElement): boolean {
  const t = (el.getAttribute("type") ?? "text").toLowerCase();
  if (NON_TEXT_TYPES.has(t) || el.disabled || el.readOnly) return false;
  if (t === "email" || el.autocomplete?.includes("email")) return true;
  return /e-?mail|correo/.test(fieldMeta(el));
}

/** en formularios usuario+contraseña, el campo de usuario (le vale un correo) */
export function isUserField(el: HTMLInputElement, hasPassword: boolean): boolean {
  if (!hasPassword) return false;
  const t = (el.getAttribute("type") ?? "text").toLowerCase();
  if (NON_TEXT_TYPES.has(t) || t === "password" || el.disabled || el.readOnly) return false;
  return /user|usuario|cuenta|login|nick/.test(fieldMeta(el));
}

/** escritura compatible con frameworks (React/Vue escuchan el setter nativo) */
export function setFieldValue(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface LoginFormDetection {
  kind: "password" | "email";
  emailField: HTMLInputElement | null;
  passwordField: HTMLInputElement | null;
  /** ≥2 campos de contraseña: parece registro/cambio, no inicio de sesión */
  signupLike: boolean;
  form: HTMLFormElement | null;
  submitButton: HTMLElement | null;
}

function findSubmitIn(scope: ParentNode): HTMLElement | null {
  try {
    return scope.querySelector<HTMLElement>("input[type='submit' i], button[type='submit' i], button:not([type=button]):not([type=reset]):not([type=submit])") ?? null;
  } catch {
    return null;
  }
}

/** Busca el formulario de acceso de un documento (mismo origen), también dentro de iframes hijos. */
export function detectLoginForm(doc: Document | null | undefined, depth = 0): LoginFormDetection | null {
  if (!doc || depth > 1) return null;
  try {
    const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>("input"));
    const email = inputs.find(isEmailField) ?? null;
    const passwords = inputs.filter((i) => (i.getAttribute("type") ?? "").toLowerCase() === "password" && !i.disabled);
    const hasPassword = passwords.length > 0;
    // en formularios usuario+contraseña, el campo de usuario le vale un correo
    const user = !email && hasPassword ? (inputs.find((i) => isUserField(i, true)) ?? null) : null;
    if (!email && !user && passwords.length === 0) {
      // sin rastro de login: mirar dentro de iframes hijos mismo-origen
      for (const f of Array.from(doc.querySelectorAll("iframe"))) {
        let child: Document | null = null;
        try {
          child = f.contentDocument;
        } catch {
          child = null;
        }
        const found = detectLoginForm(child, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const pw = passwords[0] ?? null;
    const field = email ?? user ?? passwords[0]!;
    const form = field.closest("form");
    return {
      kind: pw ? "password" : "email",
      emailField: email ?? user,
      passwordField: pw,
      signupLike: passwords.length >= 2,
      form,
      submitButton: findSubmitIn(form ?? doc),
    };
  } catch {
    return null; // cross-origin: sin acceso al documento
  }
}

/* ---------- relleno ---------- */

/** Rellena usuario/correo + contraseña. Devuelve si la contraseña se rellenó. */
export function fillLoginForm(doc: Document | null, cred: { username: string; password?: string }): boolean {
  const det = detectLoginForm(doc);
  if (!det) return false;
  if (det.emailField) setFieldValue(det.emailField, cred.username);
  if (det.passwordField && cred.password) {
    setFieldValue(det.passwordField, cred.password);
    try {
      det.passwordField.focus();
    } catch {
      /* ignore */
    }
    return true;
  }
  try {
    det.emailField?.focus();
    const pw = Array.from((det.emailField?.ownerDocument ?? doc)?.querySelectorAll<HTMLInputElement>("input[type='password' i]") ?? []).find((i) => !i.disabled);
    pw?.focus();
  } catch {
    /* ignore */
  }
  return false;
}

/** Pulsa el botón de enviar del formulario detectado (solo con acción explícita del usuario). */
export function submitLoginForm(doc: Document | null): boolean {
  const det = detectLoginForm(doc);
  if (!det) return false;
  try {
    if (det.submitButton) {
      (det.submitButton as HTMLElement).click();
      return true;
    }
    if (det.form) {
      det.form.requestSubmit?.();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/* ---------- identidad: el correo del perfil ---------- */

export interface IdentityEmail {
  email: string;
  verified: boolean;
  source: "axcid" | "axcs.os";
}

/**
 * El correo con el que axcsOS inicia sesión en la web:
 * 1. el correo VERIFICADO del perfil (AXC ID) — el de verdad del usuario;
 * 2. si no hay, la dirección @axcs.os de Mail.
 */
export function identityEmail(): IdentityEmail | null {
  try {
    const session = useOS.getState().session;
    if (session) {
      const axcid = getAxcid(session.accountId);
      if (axcid?.verified && axcid.email) return { email: axcid.email, verified: true, source: "axcid" };
    }
  } catch {
    /* sin store: solo Mail */
  }
  const m = mailAddress();
  if (m) return { email: m, verified: false, source: "axcs.os" };
  return null;
}

/* ---------- hook del asistente (React) ---------- */

export interface CapturedCredential {
  host: string;
  username: string;
  password: string;
}

export interface AutofillSnapshot {
  /** hay formulario de acceso legible en la pestaña activa */
  detected: boolean;
  kind: "password" | "email" | null;
  host: string;
  signupLike: boolean;
  /** credencial guardada para este dominio */
  hasSaved: boolean;
  savedUsername: string | null;
  /** correo del perfil (verificado AXC ID o @axcs.os) */
  identityEmail: string | null;
  identityVerified: boolean;
  /** el usuario marcó «nunca guardar» aquí */
  never: boolean;
}

const EMPTY_SNAP: AutofillSnapshot = {
  detected: false,
  kind: null,
  host: "",
  signupLike: false,
  hasSaved: false,
  savedUsername: null,
  identityEmail: null,
  identityVerified: false,
  never: false,
};

export interface AutofillCtx {
  /** documento del iframe de la pestaña activa (null si no es accesible) */
  getDoc: () => Document | null;
  /** URL de la pestaña activa */
  getUrl: () => string;
}

/**
 * Hook del asistente de acceso: sondea la pestaña activa (2,5 s),
 * expone el estado del formulario detectado y las acciones de
 * relleno/guardado. ctx es un objeto ESTABLE (useRef) cuyas
 * funciones leen los refs de Safari.
 */
export function useAutofillAssistant(ctx: React.RefObject<AutofillCtx>) {
  const notify = useOS((s) => s.notify);
  const [snap, setSnap] = useState<AutofillSnapshot>(EMPTY_SNAP);
  const [savePrompt, setSavePrompt] = useState<CapturedCredential | null>(null);
  const snapJsonRef = useRef("");
  const armedFormsRef = useRef<WeakSet<HTMLFormElement>>(new WeakSet());
  const armedClickDocsRef = useRef<WeakSet<Document>>(new WeakSet());
  const dismissedSaveRef = useRef<string>("");

  /* captura: lee los valores escritos y propón guardar */
  const readCapture = useCallback((host: string, doc: Document, form: HTMLFormElement | null): CapturedCredential | null => {
    try {
      const scope: ParentNode = form ?? doc;
      const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>("input"));
      const pw = inputs.find((i) => (i.getAttribute("type") ?? "").toLowerCase() === "password" && i.value && !i.disabled);
      if (!pw) return null;
      const em = inputs.find(isEmailField);
      const hasPwAll = Array.from(doc.querySelectorAll<HTMLInputElement>("input")).some((i) => (i.getAttribute("type") ?? "").toLowerCase() === "password");
      const us = em ?? Array.from(doc.querySelectorAll<HTMLInputElement>("input")).find((i) => isUserField(i, hasPwAll));
      const username = (us?.value ?? "").trim();
      if (!username) return null; // sin usuario no hay credencial que guardar
      return { host, username, password: pw.value };
    } catch {
      return null;
    }
  }, []);

  /* sondeo + armado de captura */
  useEffect(() => {
    const onCapture = (c: CapturedCredential) => {
      if (dismissedSaveRef.current === c.host) return;
      const saved = findVaultEntry(c.host);
      if (saved && saved.username === c.username) {
        // credencial idéntica ya guardada: ni prompt ni ruido
        void getCredential(c.host).then((cur) => {
          if (!cur || cur.password !== c.password) setSavePrompt(c);
        });
        return;
      }
      setSavePrompt(c);
    };

    const armCapture = (doc: Document, host: string) => {
      // click en botón de envío (cubre SPA sin <form>): un listener por documento
      if (!armedClickDocsRef.current.has(doc)) {
        armedClickDocsRef.current.add(doc);
        doc.addEventListener(
          "click",
          (e) => {
            try {
              const el = e.target as HTMLElement | null;
              if (!el || typeof el.closest !== "function") return;
              const btn = el.closest("button, input[type='submit' i], [role='button'], [type='submit' i]");
              if (!btn) return;
              const form = btn.closest("form");
              const c = readCapture(host, doc, form);
              if (c) onCapture(c);
            } catch {
              /* ignore */
            }
          },
          true,
        );
      }
      // submit clásico de cada <form> con contraseña
      const forms = Array.from(doc.querySelectorAll<HTMLFormElement>("form"));
      for (const form of forms) {
        if (armedFormsRef.current.has(form)) continue;
        try {
          const hasPw = form.querySelector("input[type='password' i]");
          if (!hasPw) continue;
          armedFormsRef.current.add(form);
          form.addEventListener(
            "submit",
            () => {
              const c = readCapture(host, doc, form);
              if (c) onCapture(c);
            },
            true,
          );
        } catch {
          /* ignore */
        }
      }
    };

    const iv = setInterval(() => {
      const c = ctx.current;
      if (!c) return;
      const url = c.getUrl();
      const host = /^https?:/i.test(url) ? domainOf(url) : "";
      let doc: Document | null = null;
      try {
        doc = c.getDoc();
      } catch {
        doc = null;
      }
      const det = doc ? detectLoginForm(doc) : null;
      if (det && doc) armCapture(doc, host);

      const identity = identityEmail();
      const entry = host ? findVaultEntry(host) : undefined;
      const next: AutofillSnapshot = {
        detected: !!det,
        kind: det?.kind ?? null,
        host,
        signupLike: det?.signupLike ?? false,
        hasSaved: !!entry,
        savedUsername: entry?.username ?? null,
        identityEmail: identity?.email ?? null,
        identityVerified: identity?.verified ?? false,
        never: host ? isNeverSave(host) : false,
      };
      const json = JSON.stringify(next);
      if (json !== snapJsonRef.current) {
        snapJsonRef.current = json;
        setSnap(next);
      }
      // si cambió de página, el prompt de guardado pendiente ya no aplica
      setSavePrompt((p) => (p && p.host !== host ? null : p));
    }, 2500);
    return () => clearInterval(iv);
  }, [ctx, readCapture]);

  /* ---------- acciones ---------- */

  /** Rellena SOLO el correo verificado del perfil. true si rellenó en la página. */
  const fillIdentityEmail = useCallback(
    (doc: Document | null): boolean => {
      const id = identityEmail();
      if (!id || !doc) return false;
      const det = detectLoginForm(doc);
      if (!det?.emailField) return false;
      setFieldValue(det.emailField, id.email);
      try {
        det.emailField.focus();
        const pw = Array.from((det.emailField.ownerDocument ?? doc).querySelectorAll<HTMLInputElement>("input[type='password' i]") ?? []).find((i) => !i.disabled);
        pw?.focus();
      } catch {
        /* ignore */
      }
      notify("safari", "Correo rellenado", `${id.email} — escribe la contraseña para entrar`);
      return true;
    },
    [notify],
  );

  /** Rellena la credencial guardada del dominio. 'no-saved' | 'no-form' | 'filled' */
  const fillSaved = useCallback(
    async (doc: Document | null, host: string): Promise<"no-saved" | "no-form" | "filled"> => {
      if (!host) return "no-saved";
      const cred = await getCredential(host);
      if (!cred) return "no-saved";
      if (!fillLoginForm(doc, cred)) return "no-form";
      return "filled";
    },
    [],
  );

  /** Rellena y entra (pulsa el botón de enviar). Solo con acción explícita del usuario. */
  const fillAndSubmit = useCallback(
    async (doc: Document | null, host: string): Promise<"no-saved" | "no-form" | "sent" | "filled"> => {
      const r = await fillSaved(doc, host);
      if (r !== "filled") return r;
      return submitLoginForm(doc) ? "sent" : "filled";
    },
    [fillSaved],
  );

  const savePromptSave = useCallback(
    async (c: CapturedCredential) => {
      const ok = await saveCredential(c.host, c.username, c.password);
      if (ok) notify("safari", "Contraseña guardada", `${c.host} — cifrada con AES-256 en este dispositivo`);
      setSavePrompt(null);
    },
    [notify],
  );

  const savePromptNever = useCallback((c: CapturedCredential) => {
    neverSaveAgain(c.host);
    setSavePrompt(null);
  }, []);

  const dismissSavePrompt = useCallback(
    (host: string) => {
      dismissedSaveRef.current = host;
      setSavePrompt(null);
    },
    [],
  );

  return { snap, savePrompt, fillIdentityEmail, fillSaved, fillAndSubmit, savePromptSave, savePromptNever, dismissSavePrompt };
}
