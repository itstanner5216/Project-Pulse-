import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts'
      ],
      all: true,
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70
    }
  }
});
