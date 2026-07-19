import type { ComponentType, SVGProps } from 'react';
import { ChartBarIcon, GitBranchIcon, UsersIcon } from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  status: 'active' | 'soon';
}

/**
 * Primary navigation. Hiring Insights + Candidates are the recruiter layer
 * (Claude-owned); Repository Analysis is the recruiter-facing view of the
 * intelligence engine's output (Codex-owned).
 */
export const navItems: NavItem[] = [
  { to: '/insights', label: 'Hiring Insights', icon: ChartBarIcon, status: 'active' },
  { to: '/candidates', label: 'Candidates', icon: UsersIcon, status: 'active' },
  { to: '/repository', label: 'Repository Analysis', icon: GitBranchIcon, status: 'active' },
];
