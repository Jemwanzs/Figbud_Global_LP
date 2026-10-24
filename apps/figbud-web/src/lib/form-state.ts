"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared change detection for Admin Studio forms. Each form (or each scope
 * within a form) compares its current values with the values last saved, so
 * an action is ready only when its own fields differ, and editing a value
 * back to what it was makes the form clean again. Everything is local: no
 * request is made to find out whether something changed.
 */

/** Structural equality for form values: primitives, arrays, plain objects (key order ignored). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  // Undefined fields count as absent, so optional values don't make a form dirty.
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false;
  }
  return true;
}

/**
 * Tracks `current` against the last saved values. Call `markSaved()` after a
 * successful save (with the saved values, if the server normalised them);
 * after a failure, leave it alone so the unsaved changes stay unsaved.
 */
export function useSavedBaseline<T>(current: T, initial: T = current) {
  const [baseline, setBaseline] = useState<T>(initial);
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  });
  // Stable, so it can be used inside effects and callbacks.
  const markSaved = useCallback(
    (...saved: [T?]) => setBaseline(saved.length ? (saved[0] as T) : latest.current),
    [],
  );
  return { baseline, dirty: !sameValue(current, baseline), markSaved };
}

/** Warns before leaving the page while `dirty` (reload, close, external links). */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
