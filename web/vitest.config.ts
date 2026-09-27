import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      globalSetup: ['./test/global-setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      testTimeout: 90_000,
      hookTimeout: 180_000,
      fileParallelism: false,
    },
  }),
)
