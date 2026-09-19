import contextlib
import os
import sys


@contextlib.contextmanager
def third_party_stdout_to_stderr():
    """Redirect file-descriptor stdout for libraries that retain the original stream."""
    try:
        stdout_fd = sys.stdout.fileno()
        stderr_fd = sys.stderr.fileno()
    except (AttributeError, OSError):
        yield
        return
    saved_stdout = os.dup(stdout_fd)
    try:
        sys.stdout.flush()
        os.dup2(stderr_fd, stdout_fd)
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_stdout, stdout_fd)
        os.close(saved_stdout)