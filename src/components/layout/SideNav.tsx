import { Plus } from "lucide-react";
import { useProfile } from "@/services/profile/useProfile";
import { statusDef } from "@/services/profile/profile";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { NAV_ITEMS } from "./navItems";

export function SideNav({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const { profile } = useProfile();
  const status = statusDef(profile.status);
  return (
    <nav className="side-nav" aria-label="Primary">
      <button
        type="button"
        className="profile-chip"
        onClick={() => onNavigate("/profile")}
        aria-label="Open profile"
      >
        <span className="profile-chip-avatar">
          <Avatar avatarId={profile.avatarId} avatarEmoji={profile.avatarEmoji} size={64} />
          <span className="profile-chip-status" title={status.label}>{status.emoji}</span>
        </span>
        <span className="profile-chip-name">{profile.displayName}</span>
      </button>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = route === item.path;
        return (
          <a
            key={item.path}
            href={"#" + item.path}
            className={active ? "nav-link is-active" : "nav-link"}
            aria-current={active ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.path);
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        );
      })}
      <span className="nav-spacer" />
      <Button block variant="warm" onClick={() => onNavigate("/add-expense")}>
        <Plus size={16} aria-hidden="true" />
        Add transaction
      </Button>
    </nav>
  );
}
