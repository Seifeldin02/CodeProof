import { NavLink } from 'react-router-dom';
import { navItems } from './navItems';

/** Horizontal nav shown below the top bar on screens without the sidebar. */
export default function MobileNav() {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
