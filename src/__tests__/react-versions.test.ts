/**
 * React and react-dom must resolve to the exact same build.
 *
 * When they don't, React throws at runtime — "Incompatible React versions" —
 * and it surfaces as an uncaught promise rejection on whichever page happens to
 * hydrate first, which makes it look like a bug in that page rather than an
 * install problem. It reached a developer as a crash on /admin/integrations.
 *
 * The cause was a caret range. `"react": "^19.0.0"` and `"react-dom": "^19.0.0"`
 * are two independent constraints, so an `npm install` on a different day can
 * satisfy them with different builds — in the reported case
 * react@19.2.0-canary-20250818 against react-dom@19.3.0-canary-20251110. Both
 * are individually valid; together they are broken. The lockfile said 19.1.0
 * for both, so the failure only appears for someone whose node_modules has
 * drifted from it.
 *
 * Both are now pinned exactly in package.json. This test catches a
 * reintroduced range, a stale node_modules, and a transitive dependency
 * quietly hoisting its own copy.
 */
import fs from 'fs';
import path from 'path';

/**
 * Reads the installed version of a package from its own manifest.
 *
 * @param name - Package name.
 * @returns The version string recorded in the installed package.json.
 */
function installedVersion(name: string): string {
  return JSON.parse(
    fs.readFileSync(require.resolve(`${name}/package.json`), 'utf8'),
  ).version as string;
}

describe('React installation integrity', () => {
  it('resolves react and react-dom to the identical build', () => {
    expect(installedVersion('react-dom')).toBe(installedVersion('react'));
  });

  it('pins both exactly in package.json, with no range', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    for (const name of ['react', 'react-dom']) {
      // A leading ^ or ~ lets the two drift apart on a future install, which is
      // exactly how the mismatch happened.
      expect(pkg.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(pkg.dependencies.react).toBe(pkg.dependencies['react-dom']);
  });

  it('matches the version the installed tree actually has', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    expect(installedVersion('react')).toBe(pkg.dependencies.react);
  });
});
