import SignInForm from "./SignInForm";
import { CheckCircleIcon, SearchCodeIcon, ShieldCheckIcon } from "@/components/ui/icons";

export default function AuthLanding({ t }: { t: (key: string) => string }) {
  const points = [
    [SearchCodeIcon, t("Real repository evidence")],
    [ShieldCheckIcon, t("Private account workspace")],
    [CheckCircleIcon, t("No paid API required")],
  ] as const;

  return (
    <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-[1320px] items-center gap-10 px-4 py-10 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:py-16">
      <section className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-brand-700">{t("Evidence-based hiring intelligence")}</p>
        <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-[-.055em] text-slate-950 sm:text-6xl">
          {t("See the engineer behind the résumé.")}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">
          {t("CodeProof turns a candidate CV and public projects into an auditable evidence dossier. Recruiters get a clear decision surface; engineers can trace every claim back to source.")}
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {points.map(([Icon, label]) => (
            <div key={label} className="flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-card">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span>
              <span className="text-xs font-semibold leading-5 text-slate-700">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,.12)] sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300"><ShieldCheckIcon className="h-6 w-6" /></span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-.03em] text-slate-950">{t("Sign in or create your account")}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t("Your candidates, reports, requirements, and hiring analytics stay isolated to your account.")}</p>
        <div className="mt-7"><SignInForm canRegister nextPath="/" /></div>
      </section>
    </div>
  );
}
