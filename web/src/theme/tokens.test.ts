import { describe, expect, test } from "bun:test";
import { contrast } from "./contrast";

// Reads the color roles straight from index.css, so the stylesheet is the only source.
const css = await Bun.file(new URL("../index.css", import.meta.url)).text();

function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g))
    tokens[name] = value;
  return tokens;
}

// [foreground role, background role, minimum ratio]. 4.5 is WCAG AA for text; 3 is the
// minimum for component boundaries such as input borders and focus rings.
const pairs: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "card", 4.5],
  ["foreground", "muted", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["input", "background", 3],
  ["input", "card", 3],
  ["input", "muted", 3],
  ["ring", "background", 3],
  ["ring", "card", 3],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["income", "card", 4.5],
  ["income", "background", 4.5],
  ["transfer", "card", 4.5],
  ["warning", "card", 4.5],
  ["warning", "warning-muted", 4.5],
  ["destructive", "card", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "destructive-muted", 4.5],
  ["destructive-foreground", "destructive", 4.5],
];

for (const [theme, selector] of [
  ["light", ":root"],
  ["dark", ".dark"],
] as const) {
  describe(`${theme} theme`, () => {
    const tokens = block(selector);
    for (const [fg, bg, minimum] of pairs)
      test(`${fg} on ${bg} is at least ${minimum}:1`, () => {
        expect(tokens[fg]).toBeDefined();
        expect(tokens[bg]).toBeDefined();
        expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(minimum);
      });
  });
}

test("contrast matches the WCAG reference values", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  // The old input border measured in the UX audit, which failed the 3:1 rule.
  expect(contrast("#d3ddd3", "#ffffff")).toBeLessThan(1.5);
});
