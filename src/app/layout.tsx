import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { generateLandingPageMeta } from "@/components/seo/LandingPageMeta";
import { initializeDatabase } from "@/lib/database/connection";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = generateLandingPageMeta();

// Initialize database connection on app start
initializeDatabase().catch(console.error);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <MantineProvider>
            <Notifications />
            {children}
          </MantineProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
