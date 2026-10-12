import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { useRoute } from "@/router";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ExpensesPage } from "@/features/expenses/ExpensesPage";
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

  return (
    <ToastProvider>
      <ThemeProvider>
      <ProfileProvider>
      <CurrencyGate>
      <ExpensesProvider>
        <BudgetsProvider>
          <CatProvider>
          <ThemedBackground />
          <AppShell route={route} onNavigate={navigate}>
            {renderRoute(route, navigate)}
          </AppShell>
          <BadgeHost />
          </CatProvider>
        </BudgetsProvider>
      </ExpensesProvider>
      </CurrencyGate>
      </ProfileProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}

function renderRoute(route: string, navigate: (path: string) => void) {
  switch (route) {
    case "/dashboard":
      return <DashboardPage onNavigate={navigate} />;
    case "/expenses":
      return <ExpensesPage onNavigate={navigate} />;
    case "/add-expense":
      return <AddExpensePage onNavigate={navigate} />;
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
