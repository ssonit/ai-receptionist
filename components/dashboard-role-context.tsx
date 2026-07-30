"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceRole } from "@/lib/workspace-roles";

const DashboardRoleContext = createContext<WorkspaceRole | null>(null);

export function DashboardRoleProvider({
  role,
  children,
}: {
  role: WorkspaceRole | null;
  children: ReactNode;
}) {
  return (
    <DashboardRoleContext.Provider value={role}>
      {children}
    </DashboardRoleContext.Provider>
  );
}

export function useDashboardRole(): WorkspaceRole | null {
  return useContext(DashboardRoleContext);
}
