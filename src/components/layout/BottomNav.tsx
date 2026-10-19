import { NAV_ITEMS } from "./navItems";

export function BottomNav({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const items = NAV_ITEMS.filter((item) => item.bottom);
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
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
            <Icon size={24} aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
