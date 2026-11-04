import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { useProfile } from "@/services/profile/useProfile";
import { Avatar } from "@/components/ui/Avatar";
import { SideNav } from "./SideNav";
import { BottomNav } from "./BottomNav";

export function AppShell({
  route,
  onNavigate,
  children,
}: {
  route: string;
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  const { profile } = useProfile();
  return (
    <div className="app-shell">
      <button
        type="button"
        className="skip-link"
        onClick={() => {
          const main = document.getElementById("main-content");
          if (main) main.focus();
        }}
      >
        Skip to content
      </button>
      <SideNav route={route} onNavigate={onNavigate} />
      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="app-main-inner">{children}</div>
      </main>
      <button
        type="button"
        className="fab"
        aria-label="Add transaction"
        onClick={() => onNavigate("/add-expense")}
      >
        <Plus size={18} aria-hidden="true" />
        <span>Add transaction</span>
      </button>
      <button
        type="button"
        className="profile-fab"
        aria-label="Open profile"
        onClick={() => onNavigate("/profile")}
      >
        <Avatar avatarId={profile.avatarId} avatarEmoji={profile.avatarEmoji} size={36} />
      </button>
      <BottomNav route={route} onNavigate={onNavigate} />
    </div>
  );
}
