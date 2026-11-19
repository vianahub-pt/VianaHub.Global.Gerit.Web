import ts from "typescript";

const adapterFiles = new Map([
  ["domains/operations/actions/action-form-page.tsx", "actions"],
  ["domains/operations/roles/role-form-page.tsx", "roles"],
  ["domains/operations/teams/team-form-page.tsx", "teams"],
  ["domains/operations/users/user-form-page.tsx", "users"],
  ["domains/identity/preferences/user-preferences-page.tsx", "user-preferences"],
]);

const requiredBehaviorTests = [
  "tests/shared/ui-standard.test.mjs",
  "tests/shared/hub-image.test.mjs",
  "tests/preferences/user-preferences-layout.test.mjs",
  "tests/preferences/user-preferences-contract.test.mjs",
  "tests/users/permission-claims.test.mjs",
  "tests/clients/client-ui-contract.test.mjs",
  "tests/e2e/hub-image-journey.spec.ts",
];

function normalizeText(value) {
  return value.replaceAll("\r\n", "\n");
}

function normalizeTextareaAdapter(source) {
  return normalizeText(source)
    .replace(/^import \{ Textarea \} from "@\/shared\/ui\/textarea";\n/gm, "")
    .replaceAll("<Textarea", "<textarea")
    .replaceAll("</Textarea", "</textarea")
    .replace(/className="(?:h-24 w-full rounded-sm border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring disabled:opacity-50|min-h-24 resize-y)"/g, "className=\"__presentation__\"");
}

function normalizeUserImageAdapter(source) {
  return normalizeText(source)
    .replace('import { ImagePicker } from "@/shared/ui/image-picker";', 'import { ImagePicker } from "@/shared/ui/image-picker";')
    .replace('import { HubImage } from "@/shared/ui";', 'import { ImagePicker } from "@/shared/ui/image-picker";')
    .replaceAll("<HubImage", "<ImagePicker")
    .replaceAll("</HubImage", "</ImagePicker")
    .replaceAll("urlImage={urlImage}", "value={urlImage}")
    .replaceAll("onUrlImageChange={setUrlImage}", "onChange={setUrlImage}")
    .replaceAll('t("hubImage.uploadUnavailable")', 't("users.image.uploadUnavailable")');
}

function functionPrelude(source) {
  const normalized = normalizeText(source)
    .replace(/^import \{ USER_PREFERENCES_SWITCH_FOCUS_CLASSES \} from "@\/domains\/identity\/preferences\/user-preferences-ui";\n/gm, "")
    .replace(/^import \{ HubSwitch, HubTabs \} from "@\/shared\/ui";\n/gm, "");
  const start = normalized.indexOf("export function UserPreferencesPage() {");
  const render = normalized.indexOf("  return (", start);
  return start >= 0 && render > start ? normalized.slice(start, render) : null;
}

function controlStateFingerprint(source) {
  const file = ts.createSourceFile("consumer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tracked = new Set(["value", "checked", "disabled", "required", "maxLength"]);
  const values = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && tracked.has(node.name.getText(file))) {
      values.push(node.name.getText(file) + "=" + (node.initializer?.getText(file) ?? "true"));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return values.sort();
}

function eventCallFingerprint(source) {
  const file = ts.createSourceFile("consumer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fingerprints = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(file)) && node.initializer && ts.isJsxExpression(node.initializer)) {
      const calls = [];
      const visitCall = (child) => {
        if (ts.isCallExpression(child)) {
          let text = child.expression.getText(file);
          if (text.endsWith(".setActiveTab")) text += "(TAB)";
          else text += "(" + child.arguments.map((argument) => argument.getText(file)).join(",") + ")";
          calls.push(text);
        }
        ts.forEachChild(child, visitCall);
      };
      visitCall(node.initializer.expression);
      if (calls.length === 0) calls.push(node.initializer.expression.getText(file));
      fingerprints.push(...calls);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return fingerprints.sort();
}

export function provePresentationAdapter(file, baseSource, headSource, testContents = {}) {
  const capability = adapterFiles.get(file);
  if (!capability || typeof baseSource !== "string" || typeof headSource !== "string") return null;
  const base = normalizeText(baseSource);
  const head = normalizeText(headSource);

  if (["actions", "roles", "teams"].includes(capability)) {
    if (normalizeTextareaAdapter(base) !== normalizeTextareaAdapter(head)) return null;
  } else if (capability === "users") {
    if (normalizeUserImageAdapter(base) !== normalizeUserImageAdapter(head)) return null;
  } else {
    const basePrelude = functionPrelude(base);
    const headPrelude = functionPrelude(head);
    if (!basePrelude || basePrelude !== headPrelude) return null;
    const expectedCalls = [
      "preferences.setActiveTab(TAB)",
      "preferences.setAppearance(",
      "preferences.setLocale(",
      "preferences.setCurrencyCode(",
      "preferences.setTimezone",
      "preferences.setDateFormat(",
      "preferences.setTimeFormat(",
      "preferences.setDayStart",
      "preferences.setDayEnd",
      "preferences.toggleEmailNotification(item.key)",
    ];
    for (const marker of expectedCalls) {
      const tabCallback = marker === "preferences.setActiveTab(TAB)"
        ? base.includes("preferences.setActiveTab(tab.key)") && head.includes("preferences.setActiveTab(tabId)")
        : base.includes(marker) && head.includes(marker);
      if (!tabCallback) return null;
    }
    const baseEvents = eventCallFingerprint(base);
    const headEvents = eventCallFingerprint(head);
    if (JSON.stringify(baseEvents) !== JSON.stringify(headEvents)) return null;
    const baseControlState = controlStateFingerprint(base);
    const headControlState = controlStateFingerprint(head);
    if (JSON.stringify(baseControlState) !== JSON.stringify(headControlState)) return null;
    if (!base.includes("preferences.state.activeTab === \"general\"") ||
        !head.includes("activeTab={preferences.state.activeTab}")) return null;
  }

  for (const testFile of requiredBehaviorTests) {
    const content = testContents[testFile];
    if (typeof content !== "string" || content.length === 0) return null;
  }
  const e2e = testContents["tests/e2e/hub-image-journey.spec.ts"];
  if (!e2e.includes('page.route("**/api/**"') || !e2e.includes("const mutations:")) return null;
  return { capability, evidence: "normalized-shared-ui-adapter-and-required-regression-tests" };
}

export const PRESENTATION_ADAPTER_FILES = Object.freeze([...adapterFiles.keys()]);
export const PRESENTATION_REGRESSION_TESTS = Object.freeze([...requiredBehaviorTests]);
