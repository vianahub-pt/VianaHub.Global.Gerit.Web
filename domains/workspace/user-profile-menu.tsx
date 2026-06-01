"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, UserCircle2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/platform/auth";
import { useToast } from "@/shared/feedback/use-toast";

interface UserProfileMenuProps {
  openMenuLabel: string;
  fallbackName: string;
  fallbackEmail: string;
  profileLabel: string;
  profileDescription: string;
  preferencesLabel: string;
  signOutLabel: string;
}

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "VI";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function UserProfileMenu({
  openMenuLabel,
  fallbackName,
  fallbackEmail,
  profileLabel,
  profileDescription,
  preferencesLabel,
  signOutLabel,
}: UserProfileMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { session, signOutAndRedirect } = useAuth();
  const { toast } = useToast();

  const displayName = session?.userName ?? session?.name ?? fallbackName;
  const displayEmail = session?.email ?? fallbackEmail;
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleToggleMenu = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const handleProfileClick = useCallback(() => {
    setIsOpen(false);
    toast({
      title: profileLabel,
      description: profileDescription,
    });
  }, [profileDescription, profileLabel, toast]);

  const handlePreferencesClick = useCallback(() => {
    setIsOpen(false);
    router.push("/settings/preferences");
  }, [router]);

  const handleSignOutClick = useCallback(() => {
    setIsOpen(false);
    signOutAndRedirect();
  }, [signOutAndRedirect]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleToggleMenu}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#06a8a8] text-sm font-bold text-[#e8fffe] shadow-[0_0_0_1px_rgba(4,17,24,0.1)] transition-transform hover:scale-[1.03]"
        aria-expanded={isOpen}
        aria-label={openMenuLabel}
      >
        {initials}
      </button>

      {isOpen ? (
        <div className="gerit-animate-enter absolute right-0 top-12 z-30 w-[19rem] overflow-hidden rounded-[1.75rem] border border-[#d1d8dc] bg-[#f6f7f8] shadow-[0_28px_54px_rgba(0,0,0,0.12)] dark:border-[#17313a] dark:bg-[#07161d] dark:shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
          <div className="flex justify-end px-4 pt-4">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#06a8a8] text-xs font-bold text-[#e8fffe]">
              {initials}
            </div>
          </div>

          <div className="border-b border-[#cfd7db] px-6 pb-6 pt-3 text-center dark:border-[#17313a]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#06a8a8] text-[1.9rem] font-semibold text-[#e8fffe]">
              {initials}
            </div>
            <p className="mt-4 text-[1.65rem] font-semibold leading-none text-[#3b4349] dark:text-[#dce8ee]">
              {displayName}
            </p>
            <p className="mt-3 text-sm text-[#98a4aa] dark:text-[#91a8b2]">
              {displayEmail}
            </p>
          </div>

          <nav className="px-4 py-2" aria-label={openMenuLabel}>
            <button
              type="button"
              onClick={handleProfileClick}
              className="flex w-full items-center gap-3 px-2 py-4 text-left text-[1.08rem] text-[#5d696f] transition-colors hover:text-[#11191f] dark:text-[#d7e3e8] dark:hover:text-white"
            >
              <UserCircle2
                className="h-5 w-5 text-[#b7c0c5] dark:text-[#c7d7de]"
                aria-hidden="true"
              />
              <span>{profileLabel}</span>
            </button>

            <button
              type="button"
              onClick={handlePreferencesClick}
              className="flex w-full items-center gap-3 border-t border-[#cfd7db] px-2 py-4 text-left text-[1.08rem] text-[#5d696f] transition-colors hover:text-[#11191f] dark:border-[#17313a] dark:text-[#d7e3e8] dark:hover:text-white"
            >
              <Settings
                className="h-5 w-5 text-[#b7c0c5] dark:text-[#c7d7de]"
                aria-hidden="true"
              />
              <span>{preferencesLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleSignOutClick}
              className="flex w-full items-center gap-3 border-t border-[#cfd7db] px-2 py-4 text-left text-[1.08rem] text-[#5d696f] transition-colors hover:text-[#11191f] dark:border-[#17313a] dark:text-[#d7e3e8] dark:hover:text-white"
            >
              <LogOut
                className="h-5 w-5 text-[#b7c0c5] dark:text-[#c7d7de]"
                aria-hidden="true"
              />
              <span>{signOutLabel}</span>
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
