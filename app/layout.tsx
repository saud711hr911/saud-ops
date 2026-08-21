import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaudOps | مَسار — إدارة ملفات العملاء والتجديدات",
  description: "منصة تشغيلية لإدارة ملفات العملاء والمستندات والتنبيهات والمعاملات والمهام.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
