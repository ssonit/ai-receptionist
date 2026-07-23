"use client";

import * as React from "react";

const DashboardBookingPathContext = React.createContext<string | null>(null);

export function DashboardBookingPathProvider({
  value,
  children,
}: {
  value: string | null;
  children: React.ReactNode;
}) {
  return (
    <DashboardBookingPathContext.Provider value={value}>
      {children}
    </DashboardBookingPathContext.Provider>
  );
}

export function useDashboardBookingPath(fallback = "/b/eve-pilot") {
  return React.useContext(DashboardBookingPathContext) || fallback;
}
