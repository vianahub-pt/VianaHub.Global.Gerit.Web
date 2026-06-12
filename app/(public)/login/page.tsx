import type { Metadata } from "next";

import { LoginScreen } from "@/platform/auth/login-screen";

export const metadata: Metadata = {
  title: "Login | Gerit",
  description: "Acesso a plataforma Gerit",
};

export default function LoginPage() {
  return (
    <div className="h-[100dvh]">
      <LoginScreen />
    </div>
  );
}
