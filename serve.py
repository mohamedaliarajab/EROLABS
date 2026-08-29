#!/usr/bin/env python3
"""Local preview server.

python3 -m http.server sends no Cache-Control, so browsers fall back to a
heuristic cache keyed off Last-Modified and happily keep serving yesterday's
styles.css and main.js against today's index.html. That looks exactly like a
broken build and wastes an afternoon. This sends no-store on everything.

    python3 serve.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):        # keep the terminal readable
        if "GET" in (args[0] if args else "") and " 200 " not in " ".join(map(str, args)):
            super().log_message(fmt, *args)


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
handler = partial(NoCacheHandler, directory=".")
print(f"ero-labs → http://localhost:{port}  (no-store: edits always land on reload)")
ThreadingHTTPServer(("", port), handler).serve_forever()
