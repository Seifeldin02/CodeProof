import type { ComponentType, SVGProps } from 'react';
import { ChartBarIcon, GitBranchIcon, UsersIcon } from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  status: 'active' | 'soon';
}

/**
 * Primary navigation. `Hiring Insights` is the shipped recruiter-analytics
 * surface; the others are placeholders (Candidates = future Claude slice,
 * Repository Analysis = Codex-owned intelligence engine).
 */
export const navItems: NavItem[] = [
  { to: '/insights', label: 'Hiring Insights', icon: ChartBarIcon, status: 'active' },
  { to: '/candidates', label: 'Candidates', icon: UsersIcon, status: 'soon' },
  { to: '/repository', label: 'Repository Analysis', icon: GitBranchIcon, status: 'soon' },
];
