import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { LoginScreen } from "@/platform/auth/login-screen";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-login",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Login | Gerit",
  description: "Acesso a plataforma Gerit",
};

export default async function LoginPage() {
  return (
    <div className={`${spaceGrotesk.variable} h-[100dvh]`}>
      <LoginScreen />
    </div>
  );
}
