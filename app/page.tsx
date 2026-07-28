import { LandingPage } from "@/app/_components/landing-page";
import { readGuestLocale } from "@/lib/read-locale-cookie";

export default async function HomePage() {
  const initialLocale = await readGuestLocale();
  return <LandingPage initialLocale={initialLocale} />;
}
