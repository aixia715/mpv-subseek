export function getPkgInvocation(_platform, nodeExecutable) {
  return {
    executable: nodeExecutable,
    leadingArguments: ["node_modules/@yao-pkg/pkg/lib-es5/bin.js"],
  };
}
