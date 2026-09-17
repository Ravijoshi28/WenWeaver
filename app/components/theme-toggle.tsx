"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme === "dark" ||
      (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "light" : "dark";
  }
  return <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label="Switch color theme" title="Switch color theme">
    <SunIcon className="theme-sun" size={20} aria-hidden="true" />
    <MoonIcon className="theme-moon" size={20} aria-hidden="true" />
  </button>;
}
