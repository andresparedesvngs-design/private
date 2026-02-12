// Single entrypoint for global styles + theme tokens.
// Import this module once (e.g. in main.tsx) to load Tailwind + CSS variables.

import "./index.css";

export const cssVar = (name: string) => `var(--${name})`;
export const hslVar = (name: string) => `hsl(var(--${name}))`;

export const theme = {
  color: {
    background: hslVar("background"),
    foreground: hslVar("foreground"),
    card: hslVar("card"),
    cardForeground: hslVar("card-foreground"),
    popover: hslVar("popover"),
    popoverForeground: hslVar("popover-foreground"),
    primary: hslVar("primary"),
    primaryForeground: hslVar("primary-foreground"),
    secondary: hslVar("secondary"),
    secondaryForeground: hslVar("secondary-foreground"),
    muted: hslVar("muted"),
    mutedForeground: hslVar("muted-foreground"),
    accent: hslVar("accent"),
    accentForeground: hslVar("accent-foreground"),
    destructive: hslVar("destructive"),
    destructiveForeground: hslVar("destructive-foreground"),
    border: hslVar("border"),
    input: hslVar("input"),
    ring: hslVar("ring"),
    chart1: hslVar("chart-1"),
    chart2: hslVar("chart-2"),
    chart3: hslVar("chart-3"),
    chart4: hslVar("chart-4"),
    chart5: hslVar("chart-5"),
    sidebar: hslVar("sidebar"),
    sidebarForeground: hslVar("sidebar-foreground"),
    sidebarPrimary: hslVar("sidebar-primary"),
    sidebarPrimaryForeground: hslVar("sidebar-primary-foreground"),
    sidebarAccent: hslVar("sidebar-accent"),
    sidebarAccentForeground: hslVar("sidebar-accent-foreground"),
    sidebarBorder: hslVar("sidebar-border"),
    sidebarRing: hslVar("sidebar-ring"),
  },
  font: {
    sans: cssVar("font-sans"),
    heading: cssVar("font-heading"),
  },
  radius: {
    base: cssVar("radius"),
    sm: cssVar("radius-sm"),
    md: cssVar("radius-md"),
    lg: cssVar("radius-lg"),
  },
} as const;

// Reads the computed value of a CSS variable at runtime (browser only).
export function readCssVar(
  name: string,
  element: Element = globalThis?.document?.documentElement as unknown as Element,
): string {
  if (typeof window === "undefined" || !element) return "";
  return getComputedStyle(element).getPropertyValue(`--${name}`).trim();
}

