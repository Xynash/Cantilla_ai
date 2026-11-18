import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { SessionProvider } from "@/components/session-provider";
import { AppLayout } from "@/components/layout/app-layout";
import { APP_CONFIG } from "@/config/constants";

export const metadata: Metadata = {
  title: {
    template: `%s | ${APP_CONFIG.name}`,
    default: `${APP_CONFIG.name} — ${APP_CONFIG.description}`,
  },
  description:
    "Next-generation enterprise procurement automation, intake orchestration, compliance policies and supplier management.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionProvider>
          <ThemeProvider defaultTheme="light" storageKey="cantill-ui-theme">
            <ToastProvider>
              <AppLayout>{children}</AppLayout>
            </ToastProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
