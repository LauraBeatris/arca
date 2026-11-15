"use client";

import { useSyncExternalStore } from "react";

/**
 * Small choices a visitor makes about the desk, remembered on their device
 * only: whether sound is on and whether the candle is lit.
 */

export type Prefs = { sound: boolean; candle: boolean };

const DEFAULTS: Prefs = { sound: true, candle: true };
const KEY = "arca:preferencias";

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (current) return current;
  current = DEFAULTS;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (stored && typeof stored === "object") {
      const { sound, candle } = stored as Partial<Prefs>;
      current = {
        sound: typeof sound === "boolean" ? sound : DEFAULTS.sound,
        candle: typeof candle === "boolean" ? candle : DEFAULTS.candle,
      };
    }
  } catch {
    // Private windows may refuse storage; the defaults still work.
  }
  return current;
}

export const prefs = {
  get: read,
  set(patch: Partial<Prefs>) {
    current = { ...read(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // Not remembered, but still applied for this visit.
    }
    listeners.forEach((notify) => notify());
  },
  subscribe(notify: () => void) {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  },
};

export function usePrefs(): Prefs {
  return useSyncExternalStore(prefs.subscribe, prefs.get, () => DEFAULTS);
}
