import { useCallback, useEffect, useState } from "react";

export function normalizeHash(hash: string): string {
  const raw = hash.replace(/^#/, "");
  if (!raw || raw === "/") return "/dashboard";
  return raw.charAt(0) === "/" ? raw : "/" + raw;
}

export interface ParsedRoute {
  path: string;
  params: URLSearchParams;
}

/** Split a route like "/trends?category=groceries-fresh" into path + query. */
export function parseRoute(route: string): ParsedRoute {
  const [path, query = ""] = route.split("?");
  return { path, params: new URLSearchParams(query) };
}

export function useRoute(): [string, (path: string) => void] {
  const [route, setRoute] = useState<string>(() => normalizeHash(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      setRoute(normalizeHash(window.location.hash));
      window.scrollTo({ top: 0, left: 0 });
      const main = document.getElementById("main-content");
      if (main) main.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((path: string) => {
    const withoutHash = path.charAt(0) === "#" ? path.slice(1) : path;
    const target = normalizeHash(withoutHash);
    if (normalizeHash(window.location.hash) === target) {
      setRoute(target);
      return;
    }
    window.location.hash = target;
  }, []);

  return [route, navigate];
}
