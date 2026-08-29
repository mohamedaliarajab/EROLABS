#!/usr/bin/env python3
"""Local preview server.

Two things the stdlib server gets wrong for this site.

python3 -m http.server sends no Cache-Control, so browsers fall back to a
heuristic cache keyed off Last-Modified and happily keep serving yesterday's
styles.css and main.js against today's index.html. That looks exactly like a
broken build and wastes an afternoon. This sends no-store on everything.

And SimpleHTTPRequestHandler ignores Range entirely: ask it for bytes 1000000-
1000100 of a film and it returns 200 with all 13MB. A browser that cannot fetch
a byte range cannot seek, so video.seekable comes back as 0..0 and every
currentTime you assign is clamped straight back to zero. The seek bars looked
broken; they were fine, the server could not serve the frame they asked for.
Netlify handles ranges, so this only ever bit local previews — which is where
all the testing happens.

    python3 serve.py [port]
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


class DevHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        """Serve a byte range when one is asked for, the whole file otherwise."""
        spec = self.headers.get("Range")
        if not spec:
            return super().send_head()

        m = RANGE.match(spec.strip())
        if not m:
            return super().send_head()            # multipart ranges: not worth it

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(f.fileno()).st_size
        first, last = m.group(1), m.group(2)
        if first == "":                            # bytes=-500 — the last 500
            length = min(int(last or 0), size)
            start, end = size - length, size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1
            end = min(end, size - 1)

        if start > end or start >= size:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        f.seek(start)
        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return _Slice(f, end - start + 1)

    def log_message(self, fmt, *args):            # keep the terminal readable
        joined = " ".join(map(str, args))
        if "GET" in (args[0] if args else "") and " 200 " not in joined and " 206 " not in joined:
            super().log_message(fmt, *args)


class _Slice:
    """A read-only window onto an open file, so copyfile() stops at the range."""

    def __init__(self, f, length):
        self.f, self.left = f, length

    def read(self, n=-1):
        if self.left <= 0:
            return b""
        if n is None or n < 0:
            n = self.left
        chunk = self.f.read(min(n, self.left))
        self.left -= len(chunk)
        return chunk

    def close(self):
        self.f.close()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
handler = partial(DevHandler, directory=".")
print(f"ero-labs → http://localhost:{port}  (no-store, and byte ranges so films can seek)")
ThreadingHTTPServer(("", port), handler).serve_forever()
