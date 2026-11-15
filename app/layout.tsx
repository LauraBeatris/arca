import type { Metadata, Viewport } from "next";
import { Libre_Caslon_Text, Special_Elite } from "next/font/google";
import { strings } from "@/lib/strings";
import "./globals.css";

// Mensagem: a book face, for letterpress on cream card.
const serif = Libre_Caslon_Text({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// Cancioneiro: a worn typewriter face, for thin typing paper.
const typewriter = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-typewriter",
  display: "swap",
});

export const metadata: Metadata = {
  title: strings.siteTitle,
  description: strings.description,
};

export const viewport: Viewport = {
  themeColor: "#3a2414",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={strings.lang} className={`${serif.variable} ${typewriter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
