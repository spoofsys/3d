import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Keep console output clean
        pass

def start_server():
    os.chdir(DIRECTORY)
    
    # Try port 8080 or fallback with multithreaded server
    port = PORT
    for p in range(PORT, PORT + 20):
        try:
            httpd = http.server.ThreadingHTTPServer(("", p), Handler)
            port = p
            break
        except OSError:
            continue

    url = f"http://localhost:{port}/index.html"
    print("=" * 60)
    print("  ANATOMA 3D: EXPLODED MALE ANATOMY DISSECTION STUDIO")
    print("  2,234 Modeled Pieces | Real-Time Three.js WebGL")
    print("=" * 60)
    print(f"  Server running at: {url}")
    print("  Opening browser automatically...")
    print("  Press Ctrl+C to stop the server.")
    print("=" * 60)

    webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    start_server()
