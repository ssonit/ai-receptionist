import { AccountProfileForm } from "@/app/dashboard/(main)/account/account-profile-form";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/account");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <p className="max-w-xl text-sm text-muted-foreground">
          Your login profile. Workspace / AI configuration lives in Settings.
        </p>
      </div>
      <div className="px-4 lg:px-6">
        <AccountProfileForm
          email={profile?.email || user?.email || dashboard.navUser.email}
          fullName={
            profile?.full_name || dashboard.navUser.name || ""
          }
        />
      </div>
    </div>
  );
}
