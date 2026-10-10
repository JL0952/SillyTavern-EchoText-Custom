"""Serves the repo for the harness pages, with caching off (every reload gets the
files as they are on disk). usage: python3 tests/harness/serve.py [port]"""
import functools
import http.server
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


print(f'http://127.0.0.1:{PORT}/tests/harness/index.html')
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(NoCacheHandler, directory=REPO)).serve_forever()
