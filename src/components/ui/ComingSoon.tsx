import type { ComponentType, SVGProps } from 'react';
import Badge from './Badge';

interface ComingSoonProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  owner?: string;
  points?: string[];
}

/** Honest placeholder for surfaces that are planned but not yet built. */
export default function ComingSoon({ icon: Icon, title, description, owner, points }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
      {owner && (
        <p className="mt-4">
          <Badge tone="neutral">{owner}</Badge>
        </p>
      )}
      {points && points.length > 0 && (
        <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
