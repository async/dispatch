import { definePipeline, env, job, sh, task, trigger } from "@async/pipeline";
import { claimsTasks } from "@async/claims/pipeline";

const packageInputs = [
  "package.json",
  "pnpm-lock.yaml",
  ".npmrc",
  "src/**/*.js",
  "skills/**/*.md",
  "skills/**/*.yaml",
  "skills/**/references/**/*.md",
  "scripts/build-dist.js",
  "templates/**/*.md",
  "tests/**/*.test.js",
  "tests/claims.json",
  "tests/claims.coverage.json",
  "README.md",
  "CHANGELOG.md",
  "api-contract.json",
  "API_SURFACE.md"
];

const publishInputs = [
  ...packageInputs,
  "dist/**"
];

const pipelineInputs = [
  "pipeline.js",
  "package.json",
  ".github/workflows/async-pipeline.yml",
  ".github/async-pipeline.lock.json",
  ".async-pipeline/tasks.lock.json"
];

const claims = claimsTasks({
  registry: "tests/claims.json",
  testFiles: ["tests/**/*.test.js"],
  docs: ["README.md"],
  extraInputs: ["src/**/*.js", "pipeline.js", "api-contract.json", "API_SURFACE.md"],
  repair: false
});

export default definePipeline({
  name: "dispatch",
  triggers: {
    pr: trigger.github({ events: ["pull_request"] }),
    main: trigger.github({ events: ["push"], branches: ["main"] }),
    release: trigger.github({ events: ["release"] }),
    manual: trigger.manual()
  },
  sync: {
    github: {
      nodeVersion: 24,
      cache: true
    },
    tasks: {
      prefix: "pipeline",
      runners: ["package"],
      targets: [{ package: "@async/dispatch" }],
      jobs: "all",
      tasks: "all",
      scripts: {
        "api:check": "run-task api.check",
        "api:surface": "run-task api.surface",
        "github:check": "github check",
        "github:generate": "github generate",
        "pack:check": "run-task pack.check",
        "publish:github:main": "publish github main --package .",
        "publish:github:pr": "publish github pr --package .",
        "publish:github:release": "publish github release --package .",
        "publish:npm": "publish npm --package .",
        "release:doctor": "release doctor --package .",
        "release:ensure": "release ensure --package .",
        "skills:check": "run-task skills.check",
        "sync:check": "sync check",
        "sync:generate": "sync generate",
        "verify:force": "run verify --force"
      }
    }
  },
  tasks: {
    build: task({
      description: "Build the installable Dispatch package surface in dist/.",
      inputs: packageInputs,
      outputs: ["dist/**"],
      cache: false,
      run: sh`node scripts/build-dist.js`
    }),
    test: task({
      description: "Run the local Dispatch node:test suite.",
      dependsOn: ["build"],
      inputs: ["src/**/*.js", "tests/**/*.test.js", "package.json"],
      cache: false,
      run: sh`node --test`
    }),
    "skills.check": task({
      description: "Validate bundled Dispatch skills before install or release.",
      inputs: ["skills/**/*.md", "skills/**/*.yaml", "src/skills.js", "src/cli.js", "package.json"],
      cache: false,
      run: sh`node src/cli.js skills check`
    }),
    "api.surface": task({
      description: "Regenerate the Dispatch API surface ledger from api-contract.json.",
      inputs: ["api-contract.json"],
      outputs: ["API_SURFACE.md"],
      cache: true,
      run: sh`pnpm api-contract ledger --manifest api-contract.json --out API_SURFACE.md`
    }),
    "api.check": task({
      description: "Validate the Dispatch API contract manifest and generated ledger.",
      dependsOn: ["api.surface"],
      inputs: ["api-contract.json", "API_SURFACE.md"],
      cache: false,
      run: [
        sh`pnpm api-contract check --manifest api-contract.json`,
        sh`pnpm api-contract ledger --manifest api-contract.json --check API_SURFACE.md`
      ]
    }),
    "docs.site": task({
      description: "Build the standardized GitHub Pages documentation site.",
      inputs: ["README.md", "templates/**/*.md", "scripts/build-pages.js"],
      outputs: [".async/pages/**"],
      cache: true,
      // TODO(@async/pipeline): replace this fallback when pipeline provides a first-class README-to-Pages builder.
      run: sh`node scripts/build-pages.js`
    }),
    "sync.check": task({
      description: "Validate generated workflow, lock, and package scripts from pipeline.js.",
      inputs: pipelineInputs,
      cache: false,
      run: sh`pnpm async-pipeline sync check`
    }),
    "github.check": task({
      description: "Validate generated GitHub Actions workflow and lock state from pipeline.js.",
      inputs: ["pipeline.js", "package.json", ".github/workflows/async-pipeline.yml", ".github/async-pipeline.lock.json"],
      cache: false,
      run: sh`pnpm async-pipeline github check`
    }),
    "pack.check": task({
      description: "Verify the public npm package contents without publishing.",
      dependsOn: ["build", "test", "skills.check", "api.check", "claims", "sync.check", "github.check"],
      inputs: publishInputs,
      cache: false,
      run: sh`npm --cache .async/npm-cache pack --dry-run`
    }),
    "publish.preview": task({
      description: "Publish a pull-request preview package to GitHub Packages.",
      dependsOn: ["verify"],
      inputs: publishInputs,
      cache: false,
      run: sh`pnpm async-pipeline publish github pr --package .`
    }),
    "publish.snapshot": task({
      description: "Publish a main-branch snapshot package to GitHub Packages.",
      dependsOn: ["verify"],
      inputs: publishInputs,
      cache: false,
      run: sh`pnpm async-pipeline publish github main --package .`
    }),
    "publish.stable.github": task({
      description: "Publish the stable package mirror to GitHub Packages before npm publishing.",
      dependsOn: ["release.ensure"],
      inputs: publishInputs,
      cache: false,
      run: sh`pnpm async-pipeline publish github release --package .`
    }),
    "publish.stable": task({
      description: "Publish the public npm package after the GitHub Packages mirror, then verify release state.",
      dependsOn: ["publish.stable.github"],
      inputs: publishInputs,
      cache: false,
      run: [
        sh`pnpm async-pipeline publish npm --package .`,
        sh`pnpm async-pipeline release doctor --package .`
      ]
    }),
    "release.ensure": task({
      description: "Create or verify the release tag and GitHub Release before package publishing.",
      dependsOn: ["verify"],
      inputs: publishInputs,
      cache: false,
      run: sh`pnpm async-pipeline release ensure --package .`
    }),
    "release.doctor": task({
      description: "Verify npm, GitHub Packages, and GitHub Release state for the package.",
      inputs: publishInputs,
      cache: false,
      run: sh`pnpm async-pipeline release doctor --package .`
    }),
    verify: task({
      description: "Run all local release checks.",
      dependsOn: ["pack.check", "docs.site"],
      inputs: publishInputs,
      cache: false,
      run: sh`true`
    }),
    claims
  },
  jobs: {
    verify: job({
      description: "Test, skill-check, claims-check, API-surface check, generated sync check, Pages build, and package dry-run.",
      target: "verify",
      trigger: ["manual", "pr", "main", "release"]
    }),
    preview: job({
      description: "Publish a pull-request preview package to GitHub Packages.",
      target: "publish.preview",
      trigger: ["pr"],
      env: {
        GITHUB_TOKEN: env.secret("GITHUB_TOKEN")
      },
      github: {
        permissions: {
          contents: "read",
          issues: "write",
          packages: "write",
          pullRequests: "write"
        }
      }
    }),
    snapshot: job({
      description: "Publish a main-branch snapshot package to GitHub Packages.",
      target: "publish.snapshot",
      trigger: ["main"],
      env: {
        GITHUB_TOKEN: env.secret("GITHUB_TOKEN")
      },
      github: {
        permissions: {
          contents: "read",
          packages: "write"
        }
      }
    }),
    pages: job({
      description: "Build and deploy the README-backed documentation site to GitHub Pages.",
      target: "docs.site",
      trigger: ["manual", "pr", "main"],
      github: {
        pages: {
          build: {
            kind: "static",
            path: ".async/pages"
          },
          environment: {
            name: "github-pages",
            url: "${{ steps.deployment.outputs.page_url }}"
          }
        }
      }
    }),
    publish: job({
      description: "Publish the stable GitHub Packages mirror and npm package from a release.",
      target: "publish.stable",
      trigger: ["release", "manual"],
      environment: {
        name: "npm-publish",
        url: "https://www.npmjs.com/package/@async/dispatch"
      },
      requires: {
        provenance: true
      },
      env: {
        GITHUB_TOKEN: env.secret("GITHUB_TOKEN"),
        NODE_AUTH_TOKEN: env.secret("NPM_TOKEN")
      },
      github: {
        permissions: {
          contents: "write",
          idToken: "write",
          packages: "write"
        }
      }
    }),
    "release-doctor": job({
      description: "Check published package and release state.",
      target: "release.doctor",
      trigger: ["manual"],
      env: {
        GITHUB_TOKEN: env.secret("GITHUB_TOKEN")
      },
      github: {
        permissions: {
          contents: "read",
          packages: "read"
        }
      }
    })
  }
});
