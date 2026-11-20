import { defineConfig } from 'vitest/config';
import { assetHashes } from './assetHashes';

export default defineConfig({
  base: '/kuku-farm/',
  define: {
    __ASSET_HASHES__: JSON.stringify(assetHashes()),
  },
  test: {
    environment: 'node',
  },
});
