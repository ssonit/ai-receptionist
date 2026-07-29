import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Eve — AI Booking",
  description:
    "AI booking chat: FAQ, availability checks, and calendar bookings. Dashboard for leads and appointments.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={cn(sans.variable, mono.variable, "dark")}
      lang="en"
      suppressHydrationWarning
    >
      <body className="font-sans antialiased" suppressHydrationWarning>
        <PostHogProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
