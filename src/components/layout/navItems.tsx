import {
  LayoutDashboard,
  ReceiptText,
  TrendingUp,
  PiggyBank,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  /** Dictionary key for the label, e.g. "nav.dashboard". */
  labelKey: string;
  icon: LucideIcon;
  bottom: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, bottom: true },
  { path: "/expenses", labelKey: "nav.expenses", icon: ReceiptText, bottom: true },
  { path: "/trends", labelKey: "nav.trends", icon: TrendingUp, bottom: true },
  { path: "/budgets", labelKey: "nav.budgets", icon: PiggyBank, bottom: true },
  { path: "/settings", labelKey: "nav.settings", icon: Settings, bottom: true },
];
