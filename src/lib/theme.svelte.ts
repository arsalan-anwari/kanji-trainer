// Whether the app should currently be showing dark-theme art: an explicit
// dark theme, "system" resolving to dark, or high contrast (which always
// reads as a dark surface, see kaizen-ui's .high-contrast rule).

import { prefs } from "kaizen-ui";

const DARK_MEDIA = "(prefers-color-scheme: dark)";

class SystemScheme {
  dark = $state(false);

  constructor() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_MEDIA);
    this.dark = query.matches;
    query.addEventListener("change", (event) => (this.dark = event.matches));
  }
}

const systemScheme = new SystemScheme();

export function isDarkTheme(): boolean {
  if (prefs.contrast) return true;
  if (prefs.theme === "dark") return true;
  if (prefs.theme === "light") return false;
  return systemScheme.dark;
}
