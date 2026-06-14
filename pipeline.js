import { definePipeline, job, sh, task } from "@async/pipeline";
import { claimsWorkflowTasks } from "@async/claims/pipeline";

const claims = claimsWorkflowTasks({
  task,
  sh
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
    "skills.check": task({
      description: "Validate bundled Dispatch skills before install or release.",
      inputs: ["skills/**/*.md", "skills/**/*.yaml", "src/skills.js", "src/cli.js", "package.json"],
      cache: false,
      run: sh`pnpm run skills:check`
    }),
    "api.surface": task({
      description: "Regenerate the Dispatch API surface ledger from api-contract.json.",
      inputs: ["api-contract.json"],
      outputs: ["API_SURFACE.md"],
      cache: true,
      run: sh`api-contract ledger --manifest api-contract.json --out API_SURFACE.md`
    }),
    "api.check": task({
      description: "Validate the Dispatch API contract manifest and generated ledger.",
      dependsOn: ["api.surface"],
      inputs: ["api-contract.json", "API_SURFACE.md"],
      cache: false,
      run: sh`api-contract check --manifest api-contract.json && api-contract ledger --manifest api-contract.json --check API_SURFACE.md`
    }),
    "pack.check": task({
      description: "Verify the public npm package contents without publishing.",
      dependsOn: ["test", "skills.check", "api.check", "claims"],
      inputs: ["package.json", "README.md", "API_SURFACE.md", "api-contract.json", "src/**/*.js", "skills/**/*", "templates/**/*"],
      cache: false,
      run: sh`npm publish --dry-run --access public --registry=https://registry.npmjs.org`
    }),
    "publish.npm": task({
      description: "Publish the public package to npm through @async/pipeline lifecycle publishing.",
      dependsOn: ["pack.check"],
      inputs: ["package.json", "README.md", "API_SURFACE.md", "api-contract.json", "src/**/*.js", "skills/**/*", "templates/**/*", ".github/workflows/release.yml"],
      cache: false,
      run: sh`async-pipeline publish npm --package .`
    }),
    claims
  },
  jobs: {
    verify: job({ target: ["test", "skills.check", "api.check", "claims", "pack.check"] }),
    publish: job({ target: "publish.npm" })
  }
});
