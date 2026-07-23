import { redirect } from "next/navigation";

/** @deprecated Use `/dashboard/meeting-types`. */
export default function EventTypesRedirectPage() {
  redirect("/dashboard/meeting-types");
}
