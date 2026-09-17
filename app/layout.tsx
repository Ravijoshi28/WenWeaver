import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemedToaster } from "./components/themed-toaster";
import Providers from "./provider";
import { cn } from "@/lib/utils";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WebWeaver",
  description: "A collaborative cloud workspace for building and shipping software.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable)}
    >
      <body className="min-h-full flex flex-col font-sans">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <Providers>
          {children}
        <ThemedToaster />
          </Providers>
      </body>
    </html>
  );
}
