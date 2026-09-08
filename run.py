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

def get_local_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()

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

    local_ip = get_local_ip()
    url = f"http://localhost:{port}/index.html"
    mobile_url = f"http://{local_ip}:{port}/index.html"

    print("=" * 60)
    print("  HUMAN ATLAS 3D: DISSECTION STUDIO")
    print("  2,234 Modeled Pieces | Real-Time Three.js WebGL")
    print("=" * 60)
    print(f"  [PC Browser]     {url}")
    print(f"  [Mobile Device]  {mobile_url}")
    print("=" * 60)
    print("  (Make sure your phone is connected to the same Wi-Fi)")
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
