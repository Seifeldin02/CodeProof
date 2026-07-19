import type { ComponentType, SVGProps } from "react";
import { ChartBarIcon, DashboardIcon, SearchCodeIcon, UsersIcon } from "../ui/icons";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/candidates", label: "Candidates", icon: UsersIcon },
  { to: "/analyze", label: "Analyze Candidate", icon: SearchCodeIcon },
  { to: "/insights", label: "Hiring Insights", icon: ChartBarIcon },
];
