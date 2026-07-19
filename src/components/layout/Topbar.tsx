import { useLocation } from 'react-router-dom';
import Badge from '../ui/Badge';
import BrandMark from './BrandMark';
import { navItems } from './navItems';
import { DEMO_AS_OF } from '../../features/hiring-analytics/mock/mockHiringData';
import { formatDate } from '../../lib/format';

export default function Topbar() {
  const { pathname } = useLocation();
  const current = navItems.find((n) => pathname.startsWith(n.to));

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="lg:hidden">
          <BrandMark compact />
        </div>
        <span className="hidden text-sm font-medium text-slate-500 lg:block">
          {current?.label ?? 'CodeProof'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="tnum hidden text-xs text-slate-400 sm:block">
          As of {formatDate(DEMO_AS_OF)}
        </span>
        <Badge tone="brand">Demo data</Badge>
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white"
          title="Recruiter (demo)"
        >
          RM
        </span>
      </div>
    </header>
  );
}
