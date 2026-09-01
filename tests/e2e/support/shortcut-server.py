#!/usr/bin/env python3
import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def run_xdotool(arguments, environment):
    return subprocess.run(
        ["xdotool", *arguments],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
    )


def find_browser_window(environment):
    result = run_xdotool(["search", "--onlyvisible", "--name", "."], environment)
    if result.returncode != 0:
        return None, "no visible X11 windows"

    inspected = []
    for window_id in reversed(result.stdout.splitlines()):
        class_result = run_xdotool(["getwindowclassname", window_id], environment)
        name_result = run_xdotool(["getwindowname", window_id], environment)
        window_class = class_result.stdout.strip()
        window_name = name_result.stdout.strip()
        inspected.append(f"{window_id}:{window_class}:{window_name}")
        identity = f"{window_class} {window_name}".lower()
        if "chromium" in identity or "firefox" in identity:
            return window_id, ", ".join(inspected)
    return None, ", ".join(inspected)


class ShortcutHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/shortcut":
            self.send_error(404)
            return
        environment = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":99.0")}
        window_id, inspected = find_browser_window(environment)
        if window_id is None:
            self.send_error(503, f"browser window not found ({inspected})")
            return
        focus_result = run_xdotool(["windowfocus", "--sync", window_id], environment)
        if focus_result.returncode != 0:
            self.send_error(500, focus_result.stderr.strip() or "windowfocus failed")
            return
        time.sleep(0.1)
        result = run_xdotool(["key", "--clearmodifiers", "alt+shift+y"], environment)
        if result.returncode != 0:
            self.send_error(500, result.stderr.strip() or "xdotool failed")
            return
        print(f"sent Alt+Shift+Y to window {window_id} ({inspected})", flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"window={window_id}\n{inspected}\n".encode())

    def log_message(self, _format, *_args):
        return


ThreadingHTTPServer(("0.0.0.0", 9010), ShortcutHandler).serve_forever()
