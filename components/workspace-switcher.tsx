"use client";

import { useTransition } from "react";
import { IconCheck, IconChevronDown, IconBuildingStore } from "@tabler/icons-react";
import { switchWorkspaceAction } from "@/app/dashboard/workspace-actions";
import { useWorkspaceList } from "@/components/workspace-list-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId } = useWorkspaceList();
  const [pending, startTransition] = useTransition();

  // Nothing to switch between — keep the chrome quiet.
  if (workspaces.length < 2) return null;

  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="w-full justify-between"
          disabled={pending}
          size="sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconBuildingStore className="size-4 shrink-0" />
            <span className="truncate">{active.name}</span>
          </span>
          <IconChevronDown className="size-4 shrink-0 opacity-60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            className="flex items-center justify-between gap-2"
            key={workspace.id}
            onSelect={() => {
              if (workspace.id === active.id) return;
              startTransition(async () => {
                await switchWorkspaceAction(workspace.id);
              });
            }}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{workspace.name}</span>
              <span className="text-muted-foreground text-xs capitalize">
                {workspace.role}
              </span>
            </span>
            {workspace.id === active.id ? (
              <IconCheck className="size-4 shrink-0" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
