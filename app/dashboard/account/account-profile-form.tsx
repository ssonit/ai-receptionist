"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import {
  updateAccountNameAction,
  type AccountActionState,
} from "@/app/dashboard/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const initial: AccountActionState = {};

export function AccountProfileForm({
  email,
  fullName,
}: {
  email: string;
  fullName: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateAccountNameAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={email}
            readOnly
            disabled
            className="bg-muted"
          />
          <p className="text-muted-foreground text-xs">
            Email đăng nhập (không đổi tại đây). Đổi mật khẩu sẽ bổ sung sau.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Tên hiển thị</Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={fullName}
            required
            maxLength={120}
            placeholder="Tên của bạn"
          />
        </div>
        <Button disabled={pending} type="submit">
          {pending ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </form>

      <div className="border-t pt-6">
        <p className="text-muted-foreground mb-3 text-sm">
          Đăng xuất khỏi workspace trên thiết bị này.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void signOut();
          }}
        >
          Log out
        </Button>
      </div>
    </div>
  );
}
