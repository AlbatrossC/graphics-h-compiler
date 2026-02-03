from flask import Flask, render_template, send_from_directory, request, jsonify
import os

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/compiler.html')
def compiler():
    return render_template('compiler.html')

# Serve videos specifically or use the internal static route
@app.route('/videos/<path:filename>')
def serve_video(filename):
    return send_from_directory('static/videos', filename)

# Serve libs and other root-level folders if needed
@app.route('/libs/<path:filename>')
def serve_libs(filename):
    return send_from_directory('libs', filename)

@app.route('/api/contact', methods=['POST'])
def contact():
    # Basic mock for the contact API to keep functionality
    return jsonify({"success": True, "message": "Message received"}), 200

if __name__ == '__main__':
    # Using port 5000 as default for Flask
    app.run(debug=True, host='0.0.0.0', port=5000)
