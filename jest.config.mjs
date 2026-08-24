// Jest — the api lane's NO-NETWORK layer. Contract-shape validators, URL
// builders and oracles run here; anything that crosses HTTP belongs to
// Playwright (project=api). See targets/wayfarer/api/README.md for the
// division of labor.
//
// File-pattern split, so the two runners never collide on a file:
//   *.test.ts -> Jest (this config matches nothing else)
//   *.spec.ts -> Playwright (its projects match only that)
//
// Which target's tests run comes from the same resolver as playwright and the
// load preflight (tests/lib/target.mjs, contract_d350537b): the target's own
// api tree plus the shared tests/api tree. A target with no api directory
// (e.g. example) simply has no Jest tests -- passWithNoTests keeps that a
// green no-op instead of an error.
//
// The repo is type:module, so tests are compiled and RUN as ESM: ts-jest's
// ESM mode plus node's vm-modules flag, which is why package.json invokes
// this as `node --experimental-vm-modules node_modules/jest/bin/jest.js`
// (inline NODE_OPTIONS would break npm scripts under cmd.exe on Windows).
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTarget } from './tests/lib/target.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const target = resolveTarget()

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  // Absolute on purpose (target.dir already is), and filtered: Jest refuses
  // roots that do not exist, and a target without an api tree is normal.
  roots: [join(target.dir, 'api'), join(HERE, 'tests', 'api')].filter(existsSync),
  testMatch: ['**/*.test.ts'],
  passWithNoTests: true,
  extensionsToTreatAsEsm: ['.ts'],
  // ESM imports name compiled files ('./lib/results-url.js'); strip the
  // extension so jest resolves the .ts source through the transform.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      // Inline rather than a root tsconfig.json: Playwright reads a root
      // tsconfig for path mapping, and these options are Jest's alone.
      tsconfig: {
        module: 'ES2022',
        moduleResolution: 'bundler',
        target: 'ES2022',
        strict: true,
        esModuleInterop: true
      }
    }]
  }
}
