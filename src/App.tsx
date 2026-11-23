import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { useRoute, parseRoute } from "@/router";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ExpensesPage } from "@/features/expenses/ExpensesPage";
import { TrendsPage } from "@/features/trends/TrendsPage";
import { AddExpensePage } from "@/features/expenses/AddExpensePage";
import { BudgetsPage } from "@/features/budgets/BudgetsPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { NotFoundPage } from "@/features/NotFoundPage";
import { ExpensesProvider } from "@/services/expenses/useExpenses";
import { ProfileProvider } from "@/services/profile/useProfile";
import { CurrencyGate } from "@/components/ui/CurrencyGate";
import { BudgetsProvider } from "@/services/budgets/useBudgets";
import { CatProvider } from "@/services/cat/useCat";
import { BadgeHost } from "@/features/gamification/BadgeHost";
import { CatCompanionHost } from "@/features/cat/CatCompanionHost";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider, useTheme } from "@/services/theme/useTheme";

function ThemedBackground() {
  const { theme, background } = useTheme();
  return (
    <>
      <div
        className="theme-bg"
        aria-hidden="true"
        style={{ backgroundImage: `url("${background}")` }}
      />
      {theme === "starry" && <div className="theme-bg-twinkle" aria-hidden="true" />}
    </>
  );
}

export function App() {
  const [route, navigate] = useRoute();
  // Nav highlight matches the bare path, so a drill-down query
  // ("/trends?category=…") still highlights Trends.
  const { path } = parseRoute(route);

  return (
    <ToastProvider>
      <LanguageProvider>
      <ThemeProvider>
      <ProfileProvider>
      <CurrencyGate>
      <ExpensesProvider>
        <BudgetsProvider>
          <CatProvider>
          <ThemedBackground />
          <AppShell route={path} onNavigate={navigate}>
            {renderRoute(route, navigate)}
          </AppShell>
          <BadgeHost />
          <CatCompanionHost />
          </CatProvider>
        </BudgetsProvider>
      </ExpensesProvider>
      </CurrencyGate>
      </ProfileProvider>
      </ThemeProvider>
      </LanguageProvider>
    </ToastProvider>
  );
}

function renderRoute(route: string, navigate: (path: string) => void) {
  const { path, params } = parseRoute(route);
  switch (path) {
    case "/dashboard":
      return <DashboardPage onNavigate={navigate} />;
    case "/expenses":
      // Key by the full route (including query) so "View all" from a
      // different dashboard month remounts with the new month — useState
      // initializers only run on mount.
      return <ExpensesPage key={route} onNavigate={navigate} initialMonthKey={params.get("month")} />;
    case "/trends": {
      const kindParam = params.get("kind");
      const initialKind =
        kindParam === "income" || kindParam === "expense" ? kindParam : undefined;
      // Key by the full route (including query) so a drill-down to a
      // different category remounts and applies its entry selection —
      // useState initializers only run on mount.
      return (
        <TrendsPage
          key={route}
          onNavigate={navigate}
          initialCategoryId={params.get("category")}
          initialKind={initialKind}
        />
      );
    }
    case "/add-expense":
      return <AddExpensePage onNavigate={navigate} />;
    case "/add-income":
      return <AddExpensePage onNavigate={navigate} initialKind="income" />;
    case "/budgets":
      return <BudgetsPage />;
    case "/profile":
      return <ProfilePage />;
    case "/settings":
      return <SettingsPage />;
    default:
      return <NotFoundPage onNavigate={navigate} />;
  }
}
