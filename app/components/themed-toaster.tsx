"use client";

import { Toaster } from "sonner";
import { useWorkspacePreferences } from "./use-workspace-preferences";

export function ThemedToaster() {
  const { dark } = useWorkspacePreferences();
  return <Toaster position="top-right" theme={dark ? "dark" : "light"} />;
}
