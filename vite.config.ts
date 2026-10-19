import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages 用の base パスを決める。
 * 1. VITE_BASE_PATH が指定されていればそれを優先（例: "/mato/" や "/"）。
 * 2. GitHub Actions 上では GITHUB_REPOSITORY からリポジトリ名を取り "/REPO/" にする。
 *    ただし "USER.github.io" リポジトリ（ユーザー/組織ページ）はルート "/"。
 * 3. それ以外（ローカル開発）は "/"。
 */
function resolveBase(): string {
  const explicit = process.env.VITE_BASE_PATH;
  if (explicit) {
    const withLead = explicit.startsWith('/') ? explicit : `/${explicit}`;
    return withLead.endsWith('/') ? withLead : `${withLead}/`;
  }
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (process.env.GITHUB_ACTIONS && repo) {
    return repo.toLowerCase().endsWith('.github.io') ? '/' : `/${repo}/`;
  }
  return '/';
}

export default defineConfig({
  base: resolveBase(),
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
