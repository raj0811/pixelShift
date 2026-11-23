import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PixelShift — Free Image Converter",
  description: "Convert images in your browser to PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, ICO, SVG, or PDF. Free and private.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
