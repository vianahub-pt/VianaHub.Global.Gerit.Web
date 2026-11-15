"use client";

import clsx from "clsx";
import { ArrowLeft, KeyRound, Loader2, Power, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/platform/auth";
import { useTranslation } from "@/platform/i18n";
import { useToast } from "@/shared/feedback";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Input } from "@/shared/ui/input";
import { ImagePicker } from "@/shared/ui/image-picker";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  isUserUpdateSuccess,
  isUserPhoneNumberLengthValid,
  normalizeCreatedUserId,
  normalizeUserDetail,
  toUserCreatePayload,
  toUserPasswordPayload,
  toUserUpdatePayload,
  USER_CREATE_PHONE_MAX_LENGTH,
  USER_UPDATE_PHONE_MAX_LENGTH,
  validatePassword,
  validateUserImageUrl,
  type UserDetail,
} from "@/domains/operations/users/users-contract";

interface UserFormPageProps { userId?: string }

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null) return fallback;
  const candidate = payload as { message?: unknown; error?: unknown; title?: unknown; errors?: unknown };
  for (const value of [candidate.message, candidate.error, candidate.title]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  if (typeof candidate.errors === "object" && candidate.errors !== null) {
    const first = Object.values(candidate.errors as Record<string, unknown>).find((value) => Array.isArray(value) && value.length > 0);
    if (Array.isArray(first) && typeof first[0] === "string" && first[0].trim()) return first[0];
  }
  return fallback;
}

export function UserFormPage({ userId }: UserFormPageProps) {
  const editing = userId !== undefined;
  const parsedId = editing ? Number(userId) : null;
  const validId = parsedId !== null && Number.isInteger(parsedId) && parsedId > 0;
  const { fetchWithAuth, isAuthenticated, isHydrating, hasPermission, roles, session } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const normalizedRoles = roles.map((role) => role.trim().toLowerCase());
  const canManageUsers = normalizedRoles.some((role) => ["admin", "backoffice", "manager"].includes(role));
  const canDeleteUsers = normalizedRoles.some((role) => ["admin", "backoffice"].includes(role));
  const canCreate = canManageUsers && hasPermission("Users", "Create");
  const canUpdate = canManageUsers && hasPermission("Users", "Update");
  const canActivate = canManageUsers && hasPermission("Users", "Activate");
  const canDeactivate = canManageUsers && hasPermission("Users", "Deactivate");
  const canDelete = canDeleteUsers && hasPermission("Users", "Delete");
  const [user, setUser] = useState<UserDetail | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [urlImage, setUrlImage] = useState("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const requestSequence = useRef(0);

  const loadUser = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!validId || parsedId === null) {
      setUser(null);
      setLoadError(t("users.errors.invalidId"));
      setLoading(false);
      return;
    }
    setUser(null);
    setName("");
    setEmail("");
    setPhoneNumber("");
    setUrlImage("");
    setPendingImageFile(null);
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/users/" + parsedId, { method: "GET", cache: "no-store" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(errorMessage(payload, response.status === 404 || response.status === 410 ? t("users.errors.notFound") : t("users.errors.loadDetail")));
      const detail = normalizeUserDetail(payload);
      if (!detail || detail.id !== parsedId) throw new Error(t("users.errors.loadDetail"));
      setUser(detail);
      setName(detail.name);
      setEmail(detail.email ?? "");
      setPhoneNumber(detail.phoneNumber ?? "");
      setUrlImage(detail.urlImage ?? "");
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      const message = error instanceof Error ? error.message : t("users.errors.loadDetail");
      setLoadError(message);
      toast({ title: t("users.toasts.errorTitle"), description: message, variant: "destructive" });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [fetchWithAuth, parsedId, t, toast, validId]);

  useEffect(() => {
    if (editing && !isHydrating && isAuthenticated) void loadUser();
    return () => { requestSequence.current += 1; };
  }, [editing, isAuthenticated, isHydrating, loadUser]);

  const currentUser = editing && user?.id === parsedId ? user : null;
  const isOwnAccount = currentUser !== null && session?.userId === currentUser.id;
  const statusAllowed = currentUser?.isActive ? canDeactivate : canActivate;
  const detailLoading = loading || (editing && (isHydrating || currentUser === null && loadError === null));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing ? !currentUser || !canUpdate : !canCreate) return;
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    if (!normalizedName || normalizedName.length > 150) {
      toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.name"), variant: "destructive" });
      return;
    }
    if (!normalizedEmail || normalizedEmail.length > 256) {
      toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.email"), variant: "destructive" });
      return;
    }
    if (!isUserPhoneNumberLengthValid(phoneNumber, editing)) {
      const maxLength = editing ? USER_UPDATE_PHONE_MAX_LENGTH : USER_CREATE_PHONE_MAX_LENGTH;
      toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.phoneNumber", { max: maxLength }), variant: "destructive" });
      return;
    }
    if (!validateUserImageUrl(urlImage)) {
      toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.urlImage"), variant: "destructive" });
      return;
    }
    if (pendingImageFile) {
      toast({ title: t("users.toasts.validationTitle"), description: t("users.image.uploadUnavailable"), variant: "destructive" });
      return;
    }
    if (!editing) {
      if (!validatePassword(password)) {
        toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.password"), variant: "destructive" });
        return;
      }
      if (password !== confirmPassword) {
        toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.confirmPassword"), variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetchWithAuth(
        editing && currentUser ? "/api/gerit/v1/users/" + currentUser.id : "/api/gerit/v1/users/",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing
            ? toUserUpdatePayload(normalizedName, normalizedEmail, phoneNumber, urlImage)
            : toUserCreatePayload(normalizedName, normalizedEmail, password, confirmPassword, phoneNumber, urlImage)),
        },
      );
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.save")));
      if (editing) {
        if (!isUserUpdateSuccess(payload)) throw new Error(t("users.errors.save"));
        toast({ title: t("users.toasts.successTitle"), description: t("users.toasts.updated") });
        await loadUser();
      } else {
        const newId = normalizeCreatedUserId(payload);
        if (!newId) throw new Error(t("users.errors.createResponse"));
        setPassword("");
        setConfirmPassword("");
        toast({ title: t("users.toasts.successTitle"), description: t("users.toasts.created") });
        router.push("/users/" + newId + "/");
      }
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.save"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async () => {
    if (!currentUser || !statusAllowed || statusSubmitting) return;
    const operation = currentUser.isActive ? "deactivate" : "activate";
    setStatusSubmitting(true);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/users/" + currentUser.id + "/" + operation, { method: "PATCH" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.status")));
      toast({ title: t("users.toasts.successTitle"), description: t(operation === "activate" ? "users.toasts.activated" : "users.toasts.deactivated") });
      await loadUser();
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.status"), variant: "destructive" });
    } finally {
      setStatusSubmitting(false);
    }
  };

  const deleteUser = async () => {
    if (!currentUser || !canDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/users/" + currentUser.id, { method: "DELETE" });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.delete")));
      setDeleteOpen(false);
      toast({ title: t("users.toasts.successTitle"), description: t("users.toasts.deleted") });
      router.push("/users/");
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.delete"), variant: "destructive" });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const clearPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const changeOwnPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !isOwnAccount || passwordSubmitting) return;
    if (!validatePassword(newPassword)) {
      toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.password"), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: t("users.toasts.validationTitle"), description: t("users.validation.confirmPassword"), variant: "destructive" });
      return;
    }
    setPasswordSubmitting(true);
    try {
      const response = await fetchWithAuth("/api/gerit/v1/users/" + currentUser.id + "/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toUserPasswordPayload(currentPassword, newPassword)),
      });
      if (!response) return;
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(errorMessage(payload, t("users.errors.changePassword")));
      setPasswordDialogOpen(false);
      clearPasswordForm();
      toast({ title: t("users.toasts.successTitle"), description: t("users.toasts.passwordChanged") });
    } catch (error) {
      toast({ title: t("users.toasts.errorTitle"), description: error instanceof Error ? error.message : t("users.errors.changePassword"), variant: "destructive" });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const title = editing ? currentUser?.name ?? t("users.form.editTitle") : t("users.form.newTitle");
  return (
    <div data-testid={editing ? "user-details-page-root" : "users-create-page-root"} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-background px-4 py-4 sm:px-6 dark:bg-background">
        <div className="mb-6 flex flex-col gap-4 rounded-sm border border-border/80 bg-card px-6 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => router.push("/users/")} className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary" title={t("users.actions.back")} aria-label={t("users.actions.back")}><ArrowLeft className="h-5 w-5" /></button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground dark:text-foreground sm:text-3xl">{title}</h1>
                {currentUser ? <span className={clsx("inline-flex rounded-full px-3 py-1 text-xs font-semibold", currentUser.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400")}>{t(currentUser.isActive ? "users.status.active" : "users.status.inactive")}</span> : null}
              </div>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground dark:text-muted-foreground">{t("users.form.subtitle")}</p>
            </div>
          </div>
          {currentUser && (statusAllowed || canDelete) ? (
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              {statusAllowed ? <button type="button" onClick={() => void toggleStatus()} disabled={statusSubmitting || deleteSubmitting || submitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50">{statusSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}{t(currentUser.isActive ? "users.actions.deactivate" : "users.actions.activate")}</button> : null}
              {canDelete ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={statusSubmitting || deleteSubmitting || submitting} className="inline-flex items-center gap-2 rounded-sm border border-destructive/40 bg-card px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:border-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /><span>{t("users.actions.delete")}</span></button> : null}
            </div>
          ) : null}
        </div>

        {detailLoading ? <div role="status" className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">{t("users.loadingDetail")}</span></div> : null}
        {!detailLoading && loadError ? <section role="alert" className="rounded-sm border border-destructive/40 bg-card p-6 text-sm text-destructive">{loadError}</section> : null}
        {!detailLoading && (!editing || currentUser) ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            <section data-testid="user-fields-section" className="rounded-sm border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:border-border dark:bg-surface">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]">
                <div className="space-y-5">
                  <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.form.name")}</span><Input id="user-name" required maxLength={150} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} /></label>
                  <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.form.email")}</span><Input id="user-email" type="email" required maxLength={256} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} /></label>
                  <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.form.phoneNumber")}</span><Input id="user-phone-number" type="tel" maxLength={editing ? USER_UPDATE_PHONE_MAX_LENGTH : USER_CREATE_PHONE_MAX_LENGTH} autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} /></label>
                  {!editing ? <>
                    <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.form.password")}</span><Input id="user-password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting || !canCreate} aria-describedby="user-password-help" /></label>
                    <p id="user-password-help" className="-mt-3 text-xs text-muted-foreground">{t("users.form.passwordHelp")}</p>
                    <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.form.confirmPassword")}</span><Input id="user-confirm-password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={submitting || !canCreate} /></label>
                  </> : null}
                  {editing && isOwnAccount ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.form.password")}</span><Input id="user-password-masked" type="password" value="••••••••••" disabled aria-label={t("users.form.passwordMasked")} autoComplete="off" /></label>
                      <button type="button" onClick={() => setPasswordDialogOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary"><KeyRound className="h-4 w-4" aria-hidden="true" />{t("users.actions.changePassword")}</button>
                    </div>
                  ) : null}
                </div>
                <ImagePicker value={urlImage} onChange={setUrlImage} pendingFile={pendingImageFile} onPendingFileChange={setPendingImageFile} disabled={submitting || deleteSubmitting || (editing ? !canUpdate : !canCreate)} />
              </div>
            </section>
            <div className="flex justify-start gap-3">
              <button type="button" onClick={() => router.push("/users/")} disabled={submitting || deleteSubmitting} className="inline-flex items-center gap-2 rounded-sm border border-input bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("users.actions.back")}</button>
              <button type="submit" disabled={submitting || deleteSubmitting || Boolean(pendingImageFile) || (editing ? !canUpdate || currentUser === null : !canCreate)} className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{t("users.actions.save")}</button>
            </div>
          </form>
        ) : null}
      </div>

      <ConfirmDialog open={deleteOpen} onOpenChange={(open) => { if (!deleteSubmitting) setDeleteOpen(open); }}
        title={t("users.actions.delete")} description={t("users.confirm.delete", { name: currentUser?.name ?? "" })}
        confirmLabel={t("users.actions.delete")} cancelLabel={t("users.actions.cancel")} onConfirm={() => void deleteUser()} />

      <AlertDialog open={passwordDialogOpen} onOpenChange={(open) => {
        if (!passwordSubmitting) {
          setPasswordDialogOpen(open);
          if (!open) clearPasswordForm();
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.actions.changePassword")}</AlertDialogTitle>
            <AlertDialogDescription>{t("users.password.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={(event) => void changeOwnPassword(event)} className="space-y-4">
            <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.password.current")}</span><Input id="user-current-password" type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={passwordSubmitting} /></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.password.new")}</span><Input id="user-new-password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={passwordSubmitting} /></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("users.password.confirmNew")}</span><Input id="user-confirm-new-password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} disabled={passwordSubmitting} /></label>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={passwordSubmitting}>{t("users.actions.cancel")}</AlertDialogCancel>
              <button type="submit" disabled={passwordSubmitting || !isOwnAccount} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{passwordSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{t("users.actions.save")}</button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
