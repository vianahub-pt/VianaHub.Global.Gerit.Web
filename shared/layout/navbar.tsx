"use client";

import { HubNav } from "@/shared/layout/hub-nav";

export function Navbar() {
  return (
    <div data-testid="navbar-root">
      <HubNav variant="sticky" />
    </div>
  );
}
