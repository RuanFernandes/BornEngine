import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const shimPath = resolve(repoRoot, 'native/third_party/colyseus/android-preadv-compat.c');

test('Android API 21 vectored I/O shims preserve positional reads and writes', { skip: process.platform !== 'linux' }, () => {
  const shim = readFileSync(shimPath, 'utf8');
  assert.match(shim, /ssize_t\s+preadv64\s*\(/);
  assert.match(shim, /ssize_t\s+pwritev64\s*\(/);

  const directory = mkdtempSync(join(tmpdir(), 'bornengine-preadv-'));
  const harnessPath = join(directory, 'harness.c');
  const executablePath = join(directory, 'harness');
  writeFileSync(harnessPath, String.raw`
#define _GNU_SOURCE 1
#define _LARGEFILE64_SOURCE 1
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/uio.h>
#include <unistd.h>

int main(void) {
  typedef ssize_t (*compat_preadv64_fn)(int, const struct iovec *, int, off64_t);
  compat_preadv64_fn compat_preadv = preadv64;
  char path[] = "/tmp/bornengine-preadv-XXXXXX";
  int fd = mkstemp(path);
  if (fd < 0) return 1;
  unlink(path);

  if (pwrite64(fd, "-----", 5, 0) != 5) return 2;
  struct iovec output[] = {
    { .iov_base = "hello", .iov_len = 5 },
    { .iov_base = ", ", .iov_len = 2 },
    { .iov_base = "world", .iov_len = 5 },
  };
  if (pwritev64(fd, output, 3, 5) != 12) return 3;

  char first[8] = {0};
  char second[12] = {0};
  struct iovec input[] = {
    { .iov_base = first, .iov_len = sizeof(first) },
    { .iov_base = second, .iov_len = sizeof(second) },
  };
  if (preadv64(fd, input, 2, 0) != 17) return 4;
  if (memcmp(first, "-----hel", 8) != 0) return 5;
  if (memcmp(second, "lo, world", 9) != 0) return 6;

  char tail[8] = {0};
  struct iovec short_read = { .iov_base = tail, .iov_len = sizeof(tail) };
  if (preadv64(fd, &short_read, 1, 15) != 2) return 7;
  if (memcmp(tail, "ld", 2) != 0) return 8;

  errno = 0;
  int invalid_iov_count = -1;
  if (compat_preadv(fd, input, invalid_iov_count, 0) != -1 || errno != EINVAL) return 9;
  if (pwritev64(fd, input, 0, 0) != 0) return 10;
  close(fd);
  return 0;
}
`);

  try {
    const compile = spawnSync('cc', [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-D_LARGEFILE64_SOURCE',
      shimPath, harnessPath, '-o', executablePath,
    ], { encoding: 'utf8' });
    assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);

    const result = spawnSync(executablePath, [], { encoding: 'utf8' });
    assert.equal(result.status, 0, `compatibility harness exited ${result.status}: ${result.stderr}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
