import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ClientLayout } from "@/shared/layout/client-layout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gerit",
  description: "VianaHub - Soluções Tecnológicas",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-testid="root-layout-html" lang="pt-PT" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var supported = ["pt-PT", "pt-BR", "en-US", "es-ES"];
                var stored = null;
                try {
                  stored = window.localStorage.getItem("language");
                } catch (error) {}

                var browserLanguage =
                  (navigator.languages && navigator.languages[0]) ||
                  navigator.language ||
                  "pt-PT";
                var normalized = (stored || browserLanguage).toLowerCase();
                var match =
                  supported.find(function (language) {
                    return language.toLowerCase() === normalized;
                  }) ||
                  supported.find(function (language) {
                    return language.toLowerCase().startsWith(normalized.split("-")[0]);
                  }) ||
                  "pt-PT";

                document.documentElement.setAttribute("lang", match);
              })();
            `,
          }}
        />
      </head>
      <body data-testid="root-layout-body" className={inter.className}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Saltar para conteúdo
        </a>
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
