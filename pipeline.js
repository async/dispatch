import { definePipeline, job, sh, task } from "../pipeline/packages/pipeline/dist/index.js";
import { claimsWorkflowTasks } from "../claims/dist/pipeline.js";

const claims = claimsWorkflowTasks({
  task,
  sh: localClaimsShell
}, {
  registry: "test/claims.json",
  testFiles: ["test/**/*.test.js"],
  docs: ["README.md"],
  extraInputs: ["src/**/*.js", "pipeline.js", "api-contract.json", "API_SURFACE.md"],
  repair: false
});

export default definePipeline({
  name: "dispatch",
  tasks: {
    test: task({
      description: "Run the local Dispatch node:test suite.",
      inputs: ["src/**/*.js", "test/**/*.test.js", "package.json"],
      cache: false,
      run: sh`pnpm test`
    }),
    "api.surface": task({
      description: "Regenerate the Dispatch API surface ledger from api-contract.json.",
      inputs: ["api-contract.json"],
      outputs: ["API_SURFACE.md"],
      cache: true,
      run: sh`node ../api-contract/dist/cli.js ledger --manifest api-contract.json --out API_SURFACE.md`
    }),
    "api.check": task({
      description: "Validate the Dispatch API contract manifest and generated ledger.",
      dependsOn: ["api.surface"],
      inputs: ["api-contract.json", "API_SURFACE.md"],
      cache: false,
      run: sh`node ../api-contract/dist/cli.js check --manifest api-contract.json && node ../api-contract/dist/cli.js ledger --manifest api-contract.json --check API_SURFACE.md`
    }),
    claims
  },
  jobs: {
    verify: job({ target: ["test", "api.check", "claims"] })
  }
});

function localClaimsShell(strings, ...values) {
  let command = "";
  for (let index = 0; index < strings.length; index += 1) {
    command += strings[index] ?? "";
    if (index < values.length) command += String(values[index]);
  }
  return sh([command.replaceAll("async-claims", "node ../claims/dist/cli.js")]);
}
