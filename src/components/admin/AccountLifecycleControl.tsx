"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function AccountLifecycleControl({ id, email, state }: {
  id: string;
  email: string;
  state: "active" | "suspended";
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const suspend = state === "active";
  const label = locale === "ar"
    ? (suspend ? "إيقاف الحساب" : "إعادة تفعيل الحساب")
    : (suspend ? "Suspend account" : "Reactivate account");

  async function change(): Promise<void> {
    const confirmation = locale === "ar"
      ? `${suspend ? "إيقاف" : "إعادة تفعيل"} ${email}؟`
      : `${suspend ? "Suspend" : "Reactivate"} ${email}?`;
    if (!window.confirm(confirmation)) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/accounts/${encodeURIComponent(id)}/lifecycle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: suspend ? "suspended" : "active" }),
      });
      if (!response.ok) {
        setMessage(locale === "ar" ? "تعذر تحديث الحساب. حدّث الصفحة وحاول مجددًا." : "Account update failed. Refresh and try again.");
        return;
      }
      setMessage(locale === "ar" ? "تم تحديث الحساب." : "Account updated.");
      router.refresh();
    } catch {
      setMessage(locale === "ar" ? "تعذر الاتصال. حاول مجددًا." : "Connection failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return <div className="mt-1 sm:col-span-2 sm:mt-0">
    <button type="button" onClick={change} disabled={pending}
      className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
      {pending ? (locale === "ar" ? "جارٍ التحديث…" : "Updating…") : label}
    </button>
    <p role="status" className="mt-1 text-xs text-slate-600">{message}</p>
  </div>;
}
