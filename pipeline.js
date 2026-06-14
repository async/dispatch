import { definePipeline, env, job, sh, task, trigger } from "@async/pipeline";
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
  triggers: {
    main: trigger.github({ events: ["push"], branches: ["main"] }),
    release: trigger.github({ events: ["release"] }),
    manual: trigger.manual()
  },
  sync: {
    github: true
  },
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
    "github.check": task({
      description: "Validate generated GitHub Actions workflow and lock state from pipeline.js.",
      inputs: ["pipeline.js", "package.json", ".github/workflows/async-pipeline.yml", ".github/async-pipeline.lock.json"],
      cache: false,
      run: sh`async-pipeline github check`
    }),
    "pack.check": task({
      description: "Verify the public npm package contents without publishing.",
      dependsOn: ["test", "skills.check", "api.check", "claims", "github.check"],
      inputs: ["package.json", "README.md", "API_SURFACE.md", "api-contract.json", "src/**/*.js", "skills/**/*", "templates/**/*"],
      cache: false,
      run: sh`npm publish --dry-run --access public --registry=https://registry.npmjs.org`
    }),
    "publish.npm": task({
      description: "Publish the public package to npm through @async/pipeline lifecycle publishing.",
      dependsOn: ["pack.check"],
      inputs: ["package.json", "README.md", "API_SURFACE.md", "api-contract.json", "src/**/*.js", "skills/**/*", "templates/**/*", ".github/workflows/async-pipeline.yml", ".github/async-pipeline.lock.json"],
      cache: false,
      run: sh`async-pipeline publish npm --package .`
    }),
    claims
  },
  jobs: {
    verify: job({
      target: ["test", "skills.check", "api.check", "claims", "github.check", "pack.check"],
      trigger: ["main", "manual"]
    }),
    publish: job({
      target: "publish.npm",
      trigger: ["release", "manual"],
      environment: {
        name: "npm-publish",
        url: "https://www.npmjs.com/package/@async/dispatch"
      },
      requires: {
        provenance: true
      },
      env: {
        NODE_AUTH_TOKEN: env.secret("NPM_TOKEN")
      }
    })
  }
});
