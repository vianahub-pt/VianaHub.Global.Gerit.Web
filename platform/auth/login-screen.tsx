"use client";

import {
  FormEvent,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useToast } from "@/shared/feedback/use-toast";
import {
  type EmailValidationError,
  type PasswordValidationError,
  useLoginForm,
} from "@/platform/auth/use-login-form";
import {
  SUPPORTED_LANGUAGES,
  type Language,
  useTranslation,
} from "@/platform/i18n";
import { GeritLogo } from "@/shared/ui/gerit-logo";
import { useAuth } from "@/platform/auth";
import Image from "next/image";

const LoginVisualPanel = lazy(async () => {
  const module = await import("./login-visual-panel");
  return { default: module.LoginVisualPanel };
});

function resolveEmailErrorMessage(
  error: EmailValidationError,
  t: (key: string) => string,
) {
  if (error === "empty") {
    return t("auth.login.errors.emailEmpty");
  }

  if (error === "invalid") {
    return t("auth.login.errors.emailInvalid");
  }

  return " ";
}

function resolvePasswordErrorMessage(
  error: PasswordValidationError,
  t: (key: string) => string,
) {
  if (error === "empty") {
    return t("auth.login.errors.passwordEmpty");
  }

  return " ";
}

function LoginVisualFallback({ title, body }: { title: string; body: string }) {
  return (
    <aside
      className="relative hidden h-[100dvh] overflow-hidden bg-background lg:block"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_32%,rgba(27,199,255,0.22),transparent_24%),radial-gradient(circle_at_36%_68%,rgba(255,146,74,0.16),transparent_18%),linear-gradient(135deg,#03131b_0%,#071d28_40%,#02070b_100%)]" />
      <div className="absolute bottom-12 left-10 max-w-sm xl:left-14">
        <p className="font-[family:var(--font-login)] text-xs uppercase tracking-[0.42em] text-primary">
          {title}
        </p>
        <p className="mt-4 max-w-xs text-sm leading-6 text-foreground/72 xl:text-base">
          {body}
        </p>
      </div>
    </aside>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailInputId = useId();
  const emailErrorId = `${emailInputId}-error`;
  const passwordInputId = useId();
  const passwordErrorId = `${passwordInputId}-error`;
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const {
    state: authState,
    isAuthenticated,
    isAuthenticating,
    signIn,
  } = useAuth();
  const { toast } = useToast();
  const { language, setLanguage, t } = useTranslation();
  const {
    state,
    emailError,
    passwordError,
    setEmail,
    setPassword,
    prepareSubmit,
  } = useLoginForm();

  const emailErrorMessage = useMemo(
    () => resolveEmailErrorMessage(emailError, t),
    [emailError, t],
  );

  const passwordErrorMessage = useMemo(
    () => resolvePasswordErrorMessage(passwordError, t),
    [passwordError, t],
  );

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia("(min-width: 1024px)");

    if (desktopMediaQuery.matches) {
      emailInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  const handleLocaleChange = useCallback(
    (nextLocale: Language) => {
      setLanguage(nextLocale);
    },
    [setLanguage],
  );

  const handleEmailSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const result = prepareSubmit();

      if (!result.ok) {
        return;
      }

      try {
        const session = await signIn({
          email: result.email,
          password: result.password,
        });

        toast({
          title: t("auth.login.toasts.successTitle"),
          description: t("auth.login.toasts.successDescription", {
            user: session.userName,
          }),
        });

        router.replace("/");
      } catch (error) {
        toast({
          title: t("auth.login.title"),
          description:
            error instanceof Error && error.message
              ? error.message
              : t("auth.login.genericAuthError"),
          variant: "destructive",
        });
      }
    },
    [prepareSubmit, router, signIn, t, toast],
  );

  const handleRegisterClick = useCallback(() => {
    toast({
      title: t("auth.login.toasts.registerTitle"),
      description: t("auth.login.toasts.registerDescription"),
    });
  }, [t, toast]);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-background text-white">
      <div className="relative grid h-[100dvh] lg:grid-cols-3">
        <LoginVisualPanel />
        <Suspense
          fallback={
            <LoginVisualFallback
              title={t("auth.login.visualFallbackTitle")}
              body={t("auth.login.visualFallbackBody")}
            />
          }
        ></Suspense>

        <section className="relative flex h-[100dvh] items-center justify-center px-5 sm:px-8">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,14,19,0.7)_0%,rgba(3,14,19,0.96)_100%)] lg:bg-[linear-gradient(180deg,rgba(3,14,19,0)_0%,rgba(3,14,19,0)_100%)]" />
          <div
            className="gerit-animate-enter relative w-full max-w-[24rem] rounded-[28px] border border-white/10 bg-background/88 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.36)] supports-[backdrop-filter]:bg-background/72 supports-[backdrop-filter]:backdrop-blur-xl sm:p-7"
            role="region"
            aria-label={t("auth.login.title")}
          >
            <div className="mb-7 flex items-start justify-between gap-4">
              <GeritLogo
                variant="wordmark"
                theme="dark"
                alt={t("auth.login.brand")}
                width={118}
                height={28}
                className="h-7 w-auto"
                priority
              />
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/10 p-1">
                <span className="sr-only">{t("auth.login.localeLabel")}</span>
                {SUPPORTED_LANGUAGES.map((option) => {
                  const isActive = option === language;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleLocaleChange(option)}
                      className={`rounded-full px-3 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-white"
                      }`}
                      aria-pressed={isActive}
                    >
                      {t(`language.short.${option}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <hr className="my-6 border-white/10" />
            <div>
              <h1 className="mt-4 font-[family:var(--font-login)] text-[2rem] font-semibold tracking-[-0.04em] text-foreground">
                {t("auth.login.title")}
              </h1>
              <p className="mt-2 max-w-[18rem] text-sm leading-6 text-muted-foreground">
                {t("auth.login.subtitle")}
              </p>
            </div>
            <hr className="my-6 border-white/10" />
            <form
              className="mt-6 space-y-3"
              onSubmit={handleEmailSubmit}
              noValidate
            >
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id={emailInputId}
                  ref={emailInputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={state.email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isAuthenticating}
                  placeholder={t("auth.login.emailPlaceholder")}
                  aria-invalid={emailError !== ""}
                  aria-describedby={
                    emailError !== "" ? emailErrorId : undefined
                  }
                  className={`h-12 w-full rounded-[14px] border bg-card pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/55 ${
                    emailError !== ""
                      ? "border-destructive"
                      : "border-white/16 focus:border-ring"
                  }`}
                />
              </div>

              <p
                id={emailErrorId}
                aria-live="polite"
                className={`min-h-[1.25rem] text-xs ${
                  emailError !== "" ? "text-destructive" : "text-transparent"
                }`}
              >
                {emailErrorMessage}
              </p>

              <label htmlFor={passwordInputId} className="sr-only">
                {t("auth.login.passwordLabel")}
              </label>
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <LockKeyhole
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id={passwordInputId}
                    type={isPasswordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    value={state.password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isAuthenticating}
                    placeholder={t("auth.login.passwordPlaceholder")}
                    aria-invalid={
                      passwordError !== "" || authState.error !== null
                    }
                    aria-describedby={
                      passwordError !== "" || authState.error
                        ? passwordErrorId
                        : undefined
                    }
                    className={`h-12 w-full rounded-[14px] border bg-card pl-11 pr-12 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-70 ${
                      passwordError !== "" || authState.error
                        ? "border-destructive"
                        : "border-white/16 focus:border-ring"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((current) => !current)}
                    disabled={isAuthenticating}
                    className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={
                      isPasswordVisible
                        ? t("auth.login.hidePassword")
                        : t("auth.login.showPassword")
                    }
                    aria-pressed={isPasswordVisible}
                  >
                    {isPasswordVisible ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none"
                  aria-label={t("auth.login.submitLabel")}
                >
                  {isAuthenticating ? (
                    <LoaderCircle
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <p
                id={passwordErrorId}
                aria-live="polite"
                className={`min-h-[1.25rem] text-xs ${
                  passwordError !== "" || authState.error
                    ? "text-destructive"
                    : "text-transparent"
                }`}
              >
                {authState.error ?? passwordErrorMessage}
              </p>
            </form>

            <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
              {t("auth.login.footerPrefix")}{" "}
              <button
                type="button"
                onClick={handleRegisterClick}
                className="font-semibold text-foreground underline decoration-foreground/35 underline-offset-4 transition-colors hover:text-primary"
              >
                {t("auth.login.footerAction")}
              </button>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
