"use client";

import * as React from "react";

/** Strip `mt` from the URL after a manage-link consume (history / screenshots). */
export function StripManageLinkParam({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("mt")) return;
    url.searchParams.delete("mt");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
  }, [enabled]);

  return null;
}
