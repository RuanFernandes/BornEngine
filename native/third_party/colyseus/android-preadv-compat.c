#define _LARGEFILE64_SOURCE 1

#include <errno.h>
#include <stdint.h>
#include <sys/types.h>
#include <sys/uio.h>
#include <unistd.h>

extern ssize_t pread64(int fd, void *buffer, size_t count, off64_t offset);
extern ssize_t pwrite64(int fd, const void *buffer, size_t count, off64_t offset);

#ifndef IOV_MAX
#define IOV_MAX 1024
#endif

static ssize_t transfer_iov64(int fd, const struct iovec *iov, int iovcnt, off64_t offset, int write_mode) {
  if (iovcnt < 0 || iovcnt > IOV_MAX) {
    errno = EINVAL;
    return -1;
  }
  if (iovcnt > 0 && iov == NULL) {
    errno = EFAULT;
    return -1;
  }
  if (offset < 0) {
    errno = EINVAL;
    return -1;
  }

  const size_t ssize_max = SIZE_MAX >> 1;
  ssize_t total = 0;
  for (int index = 0; index < iovcnt; ++index) {
    if ((size_t)total >= ssize_max) return total;

    size_t request = iov[index].iov_len;
    const size_t remaining_limit = ssize_max - (size_t)total;
    if (request > remaining_limit) request = remaining_limit;
    if (request == 0) continue;

    if ((uint64_t)offset + (uint64_t)total > INT64_MAX) {
      errno = EOVERFLOW;
      return total > 0 ? total : -1;
    }

    ssize_t transferred = write_mode
        ? pwrite64(fd, iov[index].iov_base, request, offset + total)
        : pread64(fd, iov[index].iov_base, request, offset + total);
    if (transferred < 0) return total > 0 ? total : -1;
    if (transferred == 0) return total;

    total += transferred;
    if ((size_t)transferred < request) return total;
  }

  return total;
}

ssize_t preadv64(int fd, const struct iovec *iov, int iovcnt, off64_t offset) {
  return transfer_iov64(fd, iov, iovcnt, offset, 0);
}

ssize_t pwritev64(int fd, const struct iovec *iov, int iovcnt, off64_t offset) {
  return transfer_iov64(fd, iov, iovcnt, offset, 1);
}
