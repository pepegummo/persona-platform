"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light / dark / system theme via a `.dark` class on <html> (see globals.css). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
