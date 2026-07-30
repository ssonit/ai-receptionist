"use client";

import * as React from "react";

type DashboardCommandContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const DashboardCommandContext =
  React.createContext<DashboardCommandContextValue | null>(null);

export function DashboardCommandProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const toggle = React.useCallback(() => {
    setOpen((v) => !v);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Some IME / synthetic events omit `key`
      if (
        typeof e.key === "string" &&
        e.key.toLowerCase() === "k" &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = React.useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  );

  return (
    <DashboardCommandContext.Provider value={value}>
      {children}
    </DashboardCommandContext.Provider>
  );
}

export function useDashboardCommand() {
  const ctx = React.useContext(DashboardCommandContext);
  if (!ctx) {
    throw new Error(
      "useDashboardCommand must be used within DashboardCommandProvider",
    );
  }
  return ctx;
}
