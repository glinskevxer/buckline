/**
 * The image, checked without building it.
 *
 * There is no docker on a developer machine here, so the image job in the
 * build is the only thing that ever runs the Dockerfile, and by then the pull
 * request is open. Everything about the image that can be checked from the
 * file itself is checked from the file itself.
 *
 * What this cannot check is the build. It checks that the build is being asked
 * to copy things that exist, run things that are declared, and start something
 * that is there.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
const ignored = readFileSync(join(root, '.dockerignore'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

function directives(name) {
  return dockerfile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${name} `))
    .map((line) => line.slice(name.length + 1).trim());
}

describe('what the image is built from', () => {
  it('pins the base image to a version rather than a tag that moves', () => {
    const from = directives('FROM')[0];
    expect(from).toMatch(/^node:\d+\.\d+\.\d+-/);
  });

  it('builds on a node the workflow also tests against', () => {
    const from = directives('FROM')[0];
    const version = from.replace('node:', '').split('-')[0];
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain(`'${version}'`);
  });

  it('copies only files that are tracked', () => {
    for (const copy of directives('COPY')) {
      const sources = copy.split(/\s+/).slice(0, -1);
      for (const source of sources) {
        const path = join(root, source);
        expect(existsSync(path), `${source} is copied and is not there`).toBe(true);
        if (!source.includes('/') && source.includes('.')) {
          expect(tracked, `${source} is copied and is not tracked`).toContain(source);
        }
      }
    }
  });

  it('copies exactly what the package says it ships', () => {
    const copied = directives('COPY').flatMap((copy) => copy.split(/\s+/).slice(0, -1));
    for (const shipped of pkg.files) {
      expect(copied, `${shipped} is shipped and is not in the image`).toContain(shipped);
    }
  });

  it('copies the lockfile with the manifest, not after it', () => {
    const first = directives('COPY')[0];
    expect(first).toContain('package.json');
    expect(first).toContain('package-lock.json');
  });

  it('leaves the tests and the build out of the image', () => {
    for (const path of ['tests', '.github', 'node_modules', 'coverage']) {
      expect(ignored, `${path} would go into the image`).toContain(path);
    }
  });
});

describe('what the image runs', () => {
  it('starts the bin the package declares', () => {
    const entrypoint = directives('ENTRYPOINT')[0];
    expect(entrypoint).toContain(pkg.bin.buckline);
  });

  it('starts something that is there and is executable', () => {
    expect(existsSync(join(root, pkg.bin.buckline))).toBe(true);
  });

  it('runs as an unprivileged user', () => {
    expect(directives('USER')).toEqual(['node']);
  });

  it('installs without letting a dependency run code', () => {
    expect(dockerfile).toContain('--ignore-scripts');
  });

  it('installs nothing it does not ship', () => {
    expect(dockerfile).toContain('--omit=dev');
  });

  it('says what it is', () => {
    const labels = directives('LABEL').join(' ');
    expect(labels).toContain('org.opencontainers.image.title');
    expect(labels).toContain('buckline');
  });

  it('does nothing that needs a language it does not carry', () => {
    expect(dockerfile).not.toContain('PYTHON');
    expect(dockerfile).not.toContain('pip');
  });
});

describe('what the build job asks the image to do', () => {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

  it('runs a real command rather than only building', () => {
    expect(workflow).toContain('docker run --rm buckline:ci');
  });

  it('runs a command the program actually has', () => {
    const match = /docker run --rm buckline:ci (.+)/.exec(workflow);
    expect(match).not.toBeNull();
    const name = match[1].trim().split(/\s+/)[0];
    const help = execFileSync('node', [join(root, 'bin', 'buckline.js'), name, '--help'], {
      encoding: 'utf8',
    });
    expect(help).toContain('Usage');
  });

  it('does not mount a host directory into the container', () => {
    expect(workflow).not.toContain('-v $');
    expect(workflow).not.toContain('--mount');
  });
});
