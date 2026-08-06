"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MyWorkspace } from "@/lib/active-workspace";

type WorkspaceListValue = {
  workspaces: MyWorkspace[];
  activeWorkspaceId: string | null;
};

const WorkspaceListContext = createContext<WorkspaceListValue>({
  workspaces: [],
  activeWorkspaceId: null,
});

export function WorkspaceListProvider({
  workspaces,
  activeWorkspaceId,
  children,
}: {
  workspaces: MyWorkspace[];
  activeWorkspaceId: string | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceListContext.Provider value={{ workspaces, activeWorkspaceId }}>
      {children}
    </WorkspaceListContext.Provider>
  );
}

export function useWorkspaceList(): WorkspaceListValue {
  return useContext(WorkspaceListContext);
}
