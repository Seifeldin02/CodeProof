import type { ComponentType, SVGProps } from "react";
import { ChartBarIcon, CompareIcon, DashboardIcon, SearchCodeIcon, UsersIcon } from "../ui/icons";

export interface NavItem {
  to: string;
  label: string;
  mobileLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/candidates", label: "Candidates", icon: UsersIcon },
  { to: "/analyze", label: "Analyze Candidate", mobileLabel: "Analyze", icon: SearchCodeIcon },
  { to: "/compare", label: "Compare Evidence", mobileLabel: "Compare", icon: CompareIcon },
  { to: "/insights", label: "Hiring Insights", mobileLabel: "Insights", icon: ChartBarIcon },
];
