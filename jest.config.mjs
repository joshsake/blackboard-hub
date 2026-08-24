// Jest — the api lane's NO-NETWORK layer. Contract-shape validators, URL
// builders and oracles run here; anything that crosses HTTP belongs to
// Playwright (project=api). See tests/api/README.md for the division.
//
// File-pattern split, so the two runners never collide on a file:
//   *.test.ts -> Jest (this config matches nothing else)
//   *.spec.ts -> Playwright (playwright.config.ts limits the api project to it)
//
// The repo is type:module, so tests are compiled and RUN as ESM: ts-jest's
// ESM mode plus node's vm-modules flag, which is why package.json invokes
// this as `node --experimental-vm-modules node_modules/jest/bin/jest.js`
// (inline NODE_OPTIONS would break npm scripts under cmd.exe on Windows).
/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/api'],
  testMatch: ['**/*.test.ts'],
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
