import os
from flask import send_from_directory
from src import create_app

app = create_app()

# ── IndexNow Key Verification ────────────────────────────────────────
# Serves the IndexNow API key file at the website root so search engines
# (Bing, Yandex, etc.) can verify ownership.
# URL: https://graphics-h-compiler.vercel.app/9264fa18540f4a9b94782e9617b7faad.txt
INDEXNOW_KEY = "9264fa18540f4a9b94782e9617b7faad"

@app.route(f'/{INDEXNOW_KEY}.txt')
def indexnow_key_file():
    """Serve the IndexNow key file from the project root."""
    return send_from_directory(
        os.path.dirname(os.path.abspath(__file__)),
        f'{INDEXNOW_KEY}.txt',
        mimetype='text/plain'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
