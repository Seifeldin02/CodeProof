"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function CreateRoleForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!response.ok) {
        setError(t(response.status === 400 ? "Add a role title and a job brief of at least 20 characters." : "Could not save this role. Try again."));
        return;
      }
      const payload = await response.json() as { role: { id: string } };
      setTitle("");
      setDescription("");
      router.push(`/shortlists?role=${encodeURIComponent(payload.role.id)}`);
      router.refresh();
    } catch {
      setError(t("Could not save this role. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <h2 className="text-base font-semibold text-slate-950">{t("Open a role")}</h2>
    <p className="mt-1 text-sm text-slate-600">{t("Save a role brief to review your existing candidate pool against its technical requirements.")}</p>
    <div className="mt-4 grid gap-4">
      <div>
        <label htmlFor="role-title" className="block text-xs font-semibold text-slate-700">{t("Role title")}</label>
        <input id="role-title" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)}
          placeholder={t("e.g. Senior full-stack engineer")}
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      </div>
      <div>
        <label htmlFor="role-description" className="block text-xs font-semibold text-slate-700">{t("Job brief")}</label>
        <textarea id="role-description" required minLength={20} maxLength={8000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)}
          placeholder={t("Describe the work and name required technologies explicitly, such as React, TypeScript, and PostgreSQL.")}
          className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
      </div>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500">{t("Every skill the brief names is compared with what each CV states, and with verified code where CodeProof has a code check. Headings such as “Requirements” and “Nice to have” are understood. Years, degrees and other requirements stay visible for you to assess.")}</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <button type="submit" disabled={saving} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
      {t(saving ? "Saving role..." : "Save role and review candidates")}
    </button>
  </form>;
}
