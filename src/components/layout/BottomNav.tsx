import { NAV_ITEMS } from "./navItems";
import { useLanguage } from "@/lib/i18n";

export function BottomNav({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const { t } = useLanguage();
  const items = NAV_ITEMS.filter((item) => item.bottom);
  return (
    <nav className="bottom-nav" aria-label={t("nav.primary")}>
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
            <span>{t(item.labelKey)}</span>
          </a>
        );
      })}
    </nav>
  );
}
