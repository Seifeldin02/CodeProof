"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { CompanyRequirement, RequirementCategory, RequirementImportance } from "@/features/requirements/store";

const IMPORTANCE: RequirementImportance[] = ["required", "preferred", "context"];
const CATEGORY: RequirementCategory[] = ["skill", "responsibility", "seniority", "experience", "domain"];

function blank(): CompanyRequirement {
  return { id: crypto.randomUUID(), requirement: "", importance: "required", category: "skill" };
}

export default function RequirementsForm({ initial }: { initial: CompanyRequirement[] }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<CompanyRequirement[]>(initial.length > 0 ? initial : [blank()]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<CompanyRequirement>): void {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setStatus("idle");
  }

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/requirements", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requirements: rows.filter((row) => row.requirement.trim()) }),
      });
      if (!response.ok) {
        setError(t(response.status === 401 ? "Sign in to change requirements." : "Something went wrong. Try again."));
        setStatus("idle");
        return;
      }
      const payload = (await response.json()) as { requirements: CompanyRequirement[] };
      setRows(payload.requirements.length > 0 ? payload.requirements : [blank()]);
      setStatus("saved");
    } catch {
      setError(t("Something went wrong. Try again."));
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <label htmlFor={`req-${row.id}`} className="block text-xs font-semibold text-slate-600">
                  {t("Requirement")} {index + 1}
                </label>
                <input
                  id={`req-${row.id}`}
                  value={row.requirement}
                  onChange={(event) => update(row.id, { requirement: event.target.value })}
                  maxLength={200}
                  placeholder={t("e.g. Production React with automated tests")}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
                />
              </div>

              <div>
                <label htmlFor={`imp-${row.id}`} className="block text-xs font-semibold text-slate-600">
                  {t("Importance")}
                </label>
                <select
                  id={`imp-${row.id}`}
                  value={row.importance}
                  onChange={(event) => update(row.id, { importance: event.target.value as RequirementImportance })}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500 sm:w-36"
                >
                  {IMPORTANCE.map((value) => <option key={value} value={value}>{t(value)}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor={`cat-${row.id}`} className="block text-xs font-semibold text-slate-600">
                  {t("Category")}
                </label>
                <select
                  id={`cat-${row.id}`}
                  value={row.category}
                  onChange={(event) => update(row.id, { category: event.target.value as RequirementCategory })}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500 sm:w-40"
                >
                  {CATEGORY.map((value) => <option key={value} value={value}>{t(value)}</option>)}
                </select>
              </div>
            </div>

            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); setStatus("idle"); }}
                className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-slate-500 hover:text-rose-600"
              >
                {t("Remove")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setRows((current) => [...current, blank()])}
        className="min-h-11 w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-brand-300 hover:bg-brand-50/50"
      >
        {t("Add requirement")}
      </button>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {status === "saving" && <i className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />}
          {t(status === "saving" ? "Saving…" : "Save requirements")}
        </button>
        {status === "saved" && <span role="status" className="text-sm font-medium text-emerald-700">{t("Saved")}</span>}
      </div>
    </form>
  );
}
