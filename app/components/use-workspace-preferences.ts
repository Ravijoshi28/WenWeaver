"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const media = ["(prefers-color-scheme: dark)", "(max-width: 900px)", "(prefers-reduced-motion: reduce)"].map(query => window.matchMedia(query));
  media.forEach(query => query.addEventListener("change", callback));
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => { media.forEach(query => query.removeEventListener("change", callback)); observer.disconnect(); };
}
const serverSnapshot = () => false;
const darkSnapshot = () => document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
const compactSnapshot = () => window.matchMedia("(max-width: 900px)").matches;
const motionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useWorkspacePreferences() {
  const dark = useSyncExternalStore(subscribe, darkSnapshot, serverSnapshot);
  const compact = useSyncExternalStore(subscribe, compactSnapshot, serverSnapshot);
  const reducedMotion = useSyncExternalStore(subscribe, motionSnapshot, serverSnapshot);
  return { dark, compact, reducedMotion };
}
