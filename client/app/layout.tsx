import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DailyPill",
  description: "Aprende algo nuevo cada día con píldoras de conocimiento personalizadas.",
  icons: {
    icon: "/icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
