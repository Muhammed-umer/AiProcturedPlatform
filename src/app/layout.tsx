import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// The display face, used only for the PRISM wordmark.
const display = Sora({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  // Pages set their own short title; the app name follows it in the tab.
  title: {
    template: "%s · PRISM",
    default: "PRISM · Placement Readiness & Integrated Skill Measurement",
  },
  description:
    "PRISM: Placement Readiness & Integrated Skill Measurement. Camera-proctored placement tests for Government College of Engineering, Erode, run on the college network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
