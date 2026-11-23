import { describe, it, expect } from "vitest";
import { THEMES, themeDef, isThemeId, DEFAULT_THEME } from "../src/services/theme/themes";
import { THEME_BACKGROUNDS } from "../src/services/theme/themeBackgrounds";
import { THEME_CAT_ART } from "../src/services/theme/art/themeArt";
import { en } from "../src/lib/locales/en";

describe("themes", () => {
  it("has five themes with cozy as default", () => {
    expect(THEMES).toHaveLength(5);
    expect(DEFAULT_THEME).toBe("cozy");
    expect(THEMES.map((t) => t.id)).toEqual([
      "cozy",
      "cyberpunk",
      "verdant",
      "starry",
      "ocean",
    ]);
  });

  it("every theme has English name, tagline, swatch and cat filter", () => {
    for (const t of THEMES) {
      expect(en[t.nameKey]).toMatch(/^[A-Za-z ]+$/);
      expect(String(en[t.taglineKey]).length).toBeGreaterThan(0);
      expect(t.swatch).toContain("linear-gradient");
      expect(typeof t.catFilter).toBe("string");
    }
    // Cozy keeps the original artwork untouched.
    expect(themeDef("cozy").catFilter).toBe("none");
  });

  it("themeDef falls back to cozy for unknown ids", () => {
    expect(themeDef("nope" as never).id).toBe("cozy");
  });

  it("isThemeId validates ids", () => {
    expect(isThemeId("ocean")).toBe(true);
    expect(isThemeId("purple")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });

  it("every theme has an embedded background data URI", () => {
    for (const t of THEMES) {
      const bg = THEME_BACKGROUNDS[t.id];
      expect(bg.startsWith("data:image/jpeg;base64,")).toBe(true);
      expect(bg.length).toBeGreaterThan(1000);
    }
  });

  it("non-cozy themes have embedded portrait + pose-scene cat art", () => {
    // Cozy reuses the original 7-pose artwork; every other theme ships
    // its own portrait (launcher) and a full scene per pose (modal).
    expect(THEME_CAT_ART.cozy).toBeUndefined();
    const poses = ["idle", "eat", "play", "groom", "sleep", "talk", "poop"];
    for (const id of ["cyberpunk", "verdant", "starry", "ocean"] as const) {
      const art = THEME_CAT_ART[id];
      expect(art).toBeDefined();
      if (!art) continue;
      expect(art.portrait.startsWith("data:image/webp;base64,")).toBe(true);
      for (const pose of poses) {
        const img = art.poses[pose as keyof typeof art.poses];
        expect(img.startsWith("data:image/webp;base64,")).toBe(true);
      }
    }
  });
});
