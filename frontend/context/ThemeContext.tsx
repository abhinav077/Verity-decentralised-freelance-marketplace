"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

// ─── Theme definitions ─────────────────────────────────────────────────────────
export type ThemeName = "light" | "dark" | "midnight" | "ocean" | "sunset" | "forest" | "rose" | "pastel";

export interface ThemeColors {
  // Page
  pageBg: string;
  pageFg: string;
  // Surfaces
  cardBg: string;
  cardBorder: string;
  cardHoverBorder: string;
  surfaceBg: string;       // secondary bg (sections)
  // Navbar
  navBg: string;
  navBorder: string;
  navText: string;
  // Primary accent
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryText: string;     // text on primary bg
  primaryFg: string;       // primary-colored text
  // Secondary text / subtle
  muted: string;
  mutedFg: string;
  // Input
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  // Misc
  divider: string;
  badgeBg: string;
  badgeText: string;
  // Status pill colors (keep functional)
  successBg: string; successText: string;
  warningBg: string; warningText: string;
  dangerBg: string;  dangerText: string;
  infoBg: string;    infoText: string;
  // Code scheme hint
  colorScheme: "light" | "dark";
}

const THEMES: Record<ThemeName, ThemeColors> = {
  /* ── Light ── clean white canvas, neutral grayscale ── */
  light: {
    pageBg: "#FFFFFF", pageFg: "#1E293B",
    cardBg: "#FFFFFF", cardBorder: "#E2E8F0", cardHoverBorder: "#94A3B8",
    surfaceBg: "#F8FAFC",
    navBg: "#FFFFFF", navBorder: "#E2E8F0", navText: "#1E293B",
    primary: "#475569", primaryHover: "#334155", primaryLight: "#F1F5F9",
    primaryText: "#FFFFFF", primaryFg: "#334155",
    muted: "#94A3B8", mutedFg: "#64748B",
    inputBg: "#FFFFFF", inputBorder: "#CBD5E1", inputFocus: "#64748B",
    divider: "#F1F5F9",
    badgeBg: "#F1F5F9", badgeText: "#334155",
    successBg: "#F0FDF4", successText: "#16A34A",
    warningBg: "#FFFBEB", warningText: "#D97706",
    dangerBg: "#FEF2F2", dangerText: "#DC2626",
    infoBg: "#F8FAFC", infoText: "#475569",
    colorScheme: "light",
  },
  /* ── Dark ── slate noir, soft blue accent ── */
  dark: {
    pageBg: "#000000", pageFg: "#F1F5F9",
    cardBg: "#111111", cardBorder: "#222222", cardHoverBorder: "#60A5FA",
    surfaceBg: "#0A0A0A",
    navBg: "#000000", navBorder: "#222222", navText: "#CBD5E1",
    primary: "#60A5FA", primaryHover: "#3B82F6", primaryLight: "#0D1F33",
    primaryText: "#000000", primaryFg: "#60A5FA",
    muted: "#333333", mutedFg: "#94A3B8",
    inputBg: "#111111", inputBorder: "#222222", inputFocus: "#60A5FA",
    divider: "#222222",
    badgeBg: "#0D1F33", badgeText: "#93C5FD",
    successBg: "#041A0D", successText: "#4ADE80",
    warningBg: "#1A0D00", warningText: "#FBBF24",
    dangerBg: "#1A0404", dangerText: "#FCA5A5",
    infoBg: "#07122B", infoText: "#93C5FD",
    colorScheme: "dark",
  },
  /* ── Midnight ── deep slate + indigo highlight ── */
  midnight: {
    pageBg: "#020617", pageFg: "#E2E8F0",
    cardBg: "#0F172A", cardBorder: "#1E293B", cardHoverBorder: "#818CF8",
    surfaceBg: "#0B1120",
    navBg: "#020617", navBorder: "#1E293B", navText: "#CBD5E1",
    primary: "#6366F1", primaryHover: "#4F46E5", primaryLight: "#1E1B4B",
    primaryText: "#FFFFFF", primaryFg: "#818CF8",
    muted: "#334155", mutedFg: "#94A3B8",
    inputBg: "#0F172A", inputBorder: "#1E293B", inputFocus: "#6366F1",
    divider: "#1E293B",
    badgeBg: "#1E1B4B", badgeText: "#A5B4FC",
    successBg: "#052E16", successText: "#34D399",
    warningBg: "#422006", warningText: "#FCD34D",
    dangerBg: "#450A0A", dangerText: "#FB7185",
    infoBg: "#172554", infoText: "#93C5FD",
    colorScheme: "dark",
  },
  /* ── Ocean ── deep navy + electric cyan ── */
  ocean: {
    pageBg: "#0A2540", pageFg: "#CAF0F8",
    cardBg: "#0D3356", cardBorder: "#164E78", cardHoverBorder: "#00B4D8",
    surfaceBg: "#0B2D4A",
    navBg: "#0A2540", navBorder: "#164E78", navText: "#90E0EF",
    primary: "#0077B6", primaryHover: "#005F8A", primaryLight: "#0A3D5C",
    primaryText: "#FFFFFF", primaryFg: "#00B4D8",
    muted: "#1A5070", mutedFg: "#5BAED0",
    inputBg: "#0D3356", inputBorder: "#164E78", inputFocus: "#00B4D8",
    divider: "#164E78",
    badgeBg: "#0A3D5C", badgeText: "#90E0EF",
    successBg: "#052E16", successText: "#34D399",
    warningBg: "#422006", warningText: "#FCD34D",
    dangerBg: "#450A0A", dangerText: "#FB7185",
    infoBg: "#0A3D5C", infoText: "#90E0EF",
    colorScheme: "dark",
  },
  /* ── Sunset ── warm ember orange + crimson depth ── */
  sunset: {
    pageBg: "#FFF7F1", pageFg: "#2D1208",
    cardBg: "#FFFFFF", cardBorder: "#F2D3C3", cardHoverBorder: "#E76F51",
    surfaceBg: "#FFF0E6",
    navBg: "#FFF7F1", navBorder: "#F2D3C3", navText: "#3D1A0A",
    primary: "#E76F51", primaryHover: "#D4553A", primaryLight: "#F8D5CE",
    primaryText: "#FFFFFF", primaryFg: "#E76F51",
    muted: "#D5B6A3", mutedFg: "#7A4A2A",
    inputBg: "#FFFFFF", inputBorder: "#F2D3C3", inputFocus: "#E76F51",
    divider: "#F2D3C3",
    badgeBg: "#F3BAB0", badgeText: "#8B2A10",
    successBg: "#D4EDDA", successText: "#155724",
    warningBg: "#FFF3CD", warningText: "#856404",
    dangerBg: "#F8D7DA", dangerText: "#721C24",
    infoBg: "#D1ECF1", infoText: "#0C5460",
    colorScheme: "light",
  },
  /* ── Forest ── lush green, light scheme ── */
  forest: {
    pageBg: "#F2FAF3", pageFg: "#0D3B1F",
    cardBg: "#FFFFFF", cardBorder: "#A5D6A7", cardHoverBorder: "#2E7D32",
    surfaceBg: "#ECF7EE",
    navBg: "#F2FAF3", navBorder: "#BFDCC1", navText: "#1B5E20",
    primary: "#2E7D32", primaryHover: "#1B5E20", primaryLight: "#E8F5E9",
    primaryText: "#FFFFFF", primaryFg: "#1B5E20",
    muted: "#B7D7BC", mutedFg: "#388E3C",
    inputBg: "#FFFFFF", inputBorder: "#BFDCC1", inputFocus: "#2E7D32",
    divider: "#BFDCC1",
    badgeBg: "#E8F5E9", badgeText: "#1B5E20",
    successBg: "#E8F5E9", successText: "#2E7D32",
    warningBg: "#FFF8E1", warningText: "#F57F17",
    dangerBg: "#FFEBEE", dangerText: "#C62828",
    infoBg: "#E3F2FD", infoText: "#1565C0",
    colorScheme: "light",
  },
  /* ── Rose ── blush pink, light scheme ── */
  rose: {
    pageBg: "#FFF7FA", pageFg: "#5A1F3F",
    cardBg: "#FFFFFF", cardBorder: "#F2D5E1", cardHoverBorder: "#E91E63",
    surfaceBg: "#FFF1F6",
    navBg: "#FFF7FA", navBorder: "#F2D5E1", navText: "#6B2147",
    primary: "#E91E63", primaryHover: "#C2185B", primaryLight: "#FFF0F5",
    primaryText: "#FFFFFF", primaryFg: "#C2185B",
    muted: "#E9C0D1", mutedFg: "#AD1457",
    inputBg: "#FFFFFF", inputBorder: "#F2D5E1", inputFocus: "#E91E63",
    divider: "#F2D5E1",
    badgeBg: "#FFF0F5", badgeText: "#880E4F",
    successBg: "#E8F5E9", successText: "#2E7D32",
    warningBg: "#FFF8E1", warningText: "#F57F17",
    dangerBg: "#FFEBEE", dangerText: "#C62828",
    infoBg: "#E3F2FD", infoText: "#1565C0",
    colorScheme: "light",
  },
  /* ── Pastel ── icy light blues, frosted look ── */
  pastel: {
    pageBg: "#F3FAFF", pageFg: "#0F2A3D",
    cardBg: "#FCFEFF", cardBorder: "#D8ECF8", cardHoverBorder: "#7FC8E8",
    surfaceBg: "#ECF7FD",
    navBg: "#F7FCFF", navBorder: "#D8ECF8", navText: "#13415E",
    primary: "#7FC8E8", primaryHover: "#5EB3D8", primaryLight: "#E6F6FF",
    primaryText: "#0B2B3F", primaryFg: "#1E6C90",
    muted: "#B9D7E8", mutedFg: "#4A7C98",
    inputBg: "#FFFFFF", inputBorder: "#CFE6F4", inputFocus: "#7FC8E8",
    divider: "#D8ECF8",
    badgeBg: "#DDF2FF", badgeText: "#1F5F80",
    successBg: "#E7F8F2", successText: "#1B7A5A",
    warningBg: "#FFF6E8", warningText: "#9A6A18",
    dangerBg: "#FFECEF", dangerText: "#B53A57",
    infoBg: "#E1F3FF", infoText: "#236E95",
    colorScheme: "light",
  },
};
export const THEME_META: Record<ThemeName, { label: string; icon: string }> = {
  light:    { label: "Light",    icon: "sun" },
  dark:     { label: "Dark",     icon: "moon" },
  midnight: { label: "Midnight", icon: "stars" },
  ocean:    { label: "Ocean",    icon: "waves" },
  sunset:   { label: "Sunset",   icon: "sunset" },
  forest:   { label: "Forest",   icon: "trees" },
  rose:     { label: "Rose",     icon: "flower" },
  pastel:   { label: "Pastel",   icon: "palette" },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

// ─── Context ────────────────────────────────────────────────────────────────────

interface ThemeCtx {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "light",
  colors: THEMES.light,
  setTheme: () => {},
});

const STORAGE_KEY = "verity-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("light");

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
      if (saved && THEMES[saved]) setThemeState(saved);
    } catch {}
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
  }, []);

  const colors = THEMES[theme];

  // Apply CSS variables to :root so Tailwind arbitrary values and inline styles both work
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = colors.colorScheme;

    // Set each color as a CSS variable
    (Object.entries(colors) as [string, string][]).forEach(([key, val]) => {
      if (key === "colorScheme") return;
      root.style.setProperty(`--t-${key}`, val);
    });

    // Also set body directly for instant paint
    document.body.style.background = colors.pageBg;
    document.body.style.color = colors.pageFg;
  }, [colors]);

  return (
    <ThemeContext.Provider value={{ theme, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ─── Utility: themed class builder ─────────────────────────────────────────────
// Usage: cn("rounded-xl", { card: true }) → applies card styling via inline style, not utility classes
// Instead of utility classes which can't reference CSS vars easily in Tailwind v4,
// use inline styles via the useTheme hook.
