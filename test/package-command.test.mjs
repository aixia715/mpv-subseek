import { describe, expect, it } from "vitest";
import { getPkgInvocation } from "../scripts/package-command.mjs";

describe("Windows pkg launcher", () => {
  it("runs pkg's JavaScript entrypoint through Node instead of spawning pkg.cmd", () => {
    const invocation = getPkgInvocation("win32", "C:\\Program Files\\nodejs\\node.exe");

    expect(invocation).toEqual({
      executable: "C:\\Program Files\\nodejs\\node.exe",
      leadingArguments: ["node_modules/@yao-pkg/pkg/lib-es5/bin.js"],
    });
    expect(invocation.executable).not.toMatch(/\.cmd$/i);
  });
});
