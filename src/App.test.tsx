import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { analyze } from "./analyze";
import { presets } from "./cron/presets";

// Preserve React's element/renderer exports; only the component's state hook is stubbed.
// Handlers update this cell, and calling App again simulates the next render.
const realReact = { ...React };
let state: unknown;
let initialized = false;
function useState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  if (!initialized) {
    state = typeof initial === "function" ? (initial as () => T)() : initial;
    initialized = true;
  }
  return [
    state as T,
    (next) => {
      state = typeof next === "function" ? (next as (previous: T) => T)(state as T) : next;
    },
  ];
}
mock.module("react", () => ({ ...realReact, useState }));
const { App } = await import("./App");

beforeEach(() => {
  initialized = false;
  state = undefined;
});
afterAll(() => {
  mock.module("react", () => realReact);
});

type TreeElement = React.ReactElement<Record<string, unknown>>;

function elements(node: React.ReactNode): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}

function find(tree: React.ReactNode, predicate: (element: TreeElement) => boolean): TreeElement {
  const matches = elements(tree).filter(predicate);
  expect(matches).toHaveLength(1);
  const match = matches[0];
  if (!match) throw new Error("Expected one matching rendered element");
  return match;
}

function input(tree: React.ReactNode): TreeElement {
  return find(tree, (element) => element.type === "input");
}

function typeExpression(tree: React.ReactNode, expression: string): ReturnType<typeof App> {
  const onChange = input(tree).props.onChange as (event: { target: { value: string } }) => void;
  onChange({ target: { value: expression } });
  return App({});
}

function expectResults(tree: ReturnType<typeof App>, expression: string): void {
  expect(input(tree).props.value).toBe(expression);
  expect(elements(tree).filter((element) => element.props.role === "alert")).toHaveLength(0);
  const analysis = analyze(expression, new Date(2024, 0, 1));
  expect(analysis.ok).toBe(true);
  if (!analysis.ok) throw new Error(analysis.error);
  expect(analysis.runs).toHaveLength(10);
  const description = find(tree, (element) => element.props.id === "description");
  expect(description.props.children).toBe(analysis.description);
  const list = find(tree, (element) => element.type === "ol");
  expect(list.props["aria-label"]).toBe("Upcoming runs");
  const entries = elements(list).filter((element) => element.type === "li");
  expect(entries).toHaveLength(10);
  const times = elements(list).filter((element) => element.type === "time");
  expect(times).toHaveLength(10);
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  let previous = Number.NEGATIVE_INFINITY;
  for (const time of times) {
    const date = new Date(time.props.dateTime as string);
    expect(Number.isFinite(date.getTime())).toBe(true);
    expect(date.getTime()).toBeGreaterThan(previous);
    previous = date.getTime();
    const zone = formatter.formatToParts(date).find((part) => part.type === "timeZoneName");
    expect(zone?.value).toBeTruthy();
    expect(time.props.children).toBe(formatter.format(date));
    expect(String(time.props.children)).toContain(zone?.value ?? "");
  }
  const markup = renderToStaticMarkup(tree);
  expect(markup).toContain('id="description"');
  expect(markup).toContain(analysis.description);
  expect(markup.match(/<time\b/g)).toHaveLength(10);
  expect(markup).not.toContain('role="alert"');
}

describe("App rendered interactions", () => {
  test("shows the initial description and ten local, zone-labelled runs", () => {
    const tree = App({ initialExpression: "0 9 * * 1-5" });
    expectResults(tree, "0 9 * * 1-5");
    const description = find(tree, (element) => element.props.id === "description");
    expect(description.props.children).toContain("09:00");
    expect(description.props.children).toContain("Monday through Friday");
  });

  test("typing invalid input removes stale results; typing valid input restores new results", () => {
    let tree = App({ initialExpression: "0 9 * * 1-5" });
    expectResults(tree, "0 9 * * 1-5");

    tree = typeExpression(tree, "61 * * * *");
    expect(input(tree).props.value).toBe("61 * * * *");
    expect(input(tree).props["aria-invalid"]).toBe(true);
    const alert = find(tree, (element) => element.props.role === "alert");
    expect(String(alert.props.children).toLowerCase()).toContain("minute");
    expect(elements(tree).filter((element) => element.props.id === "description")).toHaveLength(0);
    expect(elements(tree).filter((element) => element.type === "ol")).toHaveLength(0);
    expect(elements(tree).filter((element) => element.type === "time")).toHaveLength(0);
    const invalidMarkup = renderToStaticMarkup(tree);
    expect(invalidMarkup).toContain('role="alert"');
    expect(invalidMarkup).toContain("minute");
    expect(invalidMarkup).not.toContain('id="description"');
    expect(invalidMarkup).not.toContain("<ol");

    tree = typeExpression(tree, "*/5 * * * *");
    expectResults(tree, "*/5 * * * *");
    expect(input(tree).props["aria-invalid"]).toBe(false);
    expect(find(tree, (element) => element.props.id === "description").props.children).toContain(
      "every 5 minutes",
    );
    for (const time of elements(tree).filter((element) => element.type === "time")) {
      expect(new Date(time.props.dateTime as string).getMinutes() % 5).toBe(0);
    }
  });

  test("shows a macro expansion note only for valid macro expressions", () => {
    let tree = App({ initialExpression: "@daily" });
    const note = find(tree, (element) => element.props.id === "macro-note");
    expect(note.type).toBe("p");
    expect(note.props.className).toBe("hint");
    expect(note.props.children).toBe("@daily means 0 0 * * *");

    tree = typeExpression(tree, "0 0 * * *");
    expect(elements(tree).filter((element) => element.props.id === "macro-note")).toHaveLength(0);

    tree = typeExpression(tree, "@reboot");
    expect(elements(tree).filter((element) => element.props.id === "macro-note")).toHaveLength(0);
  });

  test("each rendered preset button fills the input and displays that schedule", () => {
    let tree = App({ initialExpression: "61 * * * *" });
    expect(presets.length).toBeGreaterThanOrEqual(5);
    expect(elements(tree).filter((element) => element.type === "button")).toHaveLength(
      presets.length,
    );
    for (const preset of presets) {
      const button = find(
        tree,
        (element) => element.type === "button" && element.props.children === preset.label,
      );
      const onClick = button.props.onClick as () => void;
      onClick();
      tree = App({});
      expectResults(tree, preset.expression);
      expect(renderToStaticMarkup(tree)).toContain(`value="${preset.expression}"`);
    }
  });

  test("accepts a never-matching expression and explains the empty run list", () => {
    const tree = App({ initialExpression: "0 0 31 2 *" });
    expect(input(tree).props.value).toBe("0 0 31 2 *");
    expect(input(tree).props["aria-invalid"]).toBe(false);
    expect(elements(tree).filter((element) => element.props.role === "alert")).toHaveLength(0);
    const analysis = analyze("0 0 31 2 *", new Date(2024, 0, 1));
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) throw new Error(analysis.error);
    expect(analysis.runs).toEqual([]);
    expect(find(tree, (element) => element.props.id === "description").props.children).toBe(
      analysis.description,
    );
    expect(elements(tree).filter((element) => element.type === "ol")).toHaveLength(0);
    expect(elements(tree).filter((element) => element.type === "time")).toHaveLength(0);
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('id="description"');
    expect(markup).toContain("No upcoming runs");
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain("<ol");
  });

  test("invalid initial input shows a field-specific error without results", () => {
    const tree = App({ initialExpression: "61 * * * *" });
    expect(find(tree, (element) => element.props.role === "alert").props.children).toContain(
      "minute",
    );
    expect(elements(tree).filter((element) => element.props.id === "description")).toHaveLength(0);
    expect(elements(tree).filter((element) => element.type === "time")).toHaveLength(0);
  });
});

describe("cron dependency boundaries", () => {
  test("the manifest uses only standard tooling and no cron library", async () => {
    const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json();
    const allowed = new Set([
      "react",
      "react-dom",
      "vite",
      "@vitejs/plugin-react",
      "typescript",
      "@biomejs/biome",
    ]);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    for (const name of Object.keys(dependencies)) {
      expect(allowed.has(name) || name.startsWith("@types/")).toBe(true);
      expect(name.toLowerCase()).not.toContain("cron");
    }
  });

  test("all cron modules are independent of React and the DOM", async () => {
    for (const name of ["parse", "next", "describe", "presets"]) {
      const source = await Bun.file(new URL(`./cron/${name}.ts`, import.meta.url)).text();
      const imports = [...source.matchAll(/^\s*import\s+(?:.*?\s+from\s+)?["']([^"']+)["']/gm)];
      for (const entry of imports) {
        // Core modules may depend only on other pure cron modules.
        expect(entry[1].startsWith("./")).toBe(true);
      }
      expect(source).not.toMatch(/\b(?:document|window|HTMLElement)\b/);
      expect(source).not.toMatch(/["']react(?:-dom)?(?:\/[^"']*)?["']/);
    }
  });
});
