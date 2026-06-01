import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ClientLayout } from "@/shared/layout/client-layout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gerit",
  description: "VianaHub - Soluções Tecnológicas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
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
      <body className={inter.className}>
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
