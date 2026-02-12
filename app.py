from flask import Flask, send_from_directory, jsonify
import os

app = Flask(__name__, static_folder='static', template_folder='templates')


os.makedirs('static', exist_ok=True)
os.makedirs('templates', exist_ok=True)
os.makedirs('compiler-assets/libs', exist_ok=True)
os.makedirs('compiler-assets/Demo_files', exist_ok=True)

# Pages
@app.route('/')
@app.route('/index.html')
def index():
    return send_from_directory('templates', 'index.html')

@app.route('/compiler')
@app.route('/compiler.html')
def compiler():
    return send_from_directory('templates', 'compiler.html')

@app.route('/docs')
@app.route('/docs.html')
def docs():
    return send_from_directory('templates', 'docs.html')


@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)


@app.route('/compiler-assets/libs/<path:filename>')
def serve_libs(filename):
    return send_from_directory('compiler-assets/libs', filename)


@app.route('/compiler-assets/Demo_files/<path:filename>')
def serve_demos(filename):
    return send_from_directory('compiler-assets/Demo_files', filename)


@app.route('/tc-zip')
def serve_tc_zip():
    zip_path = os.path.join('compiler-assets', 'zip-files', 'tc-v1.zip')
    if os.path.exists(zip_path):
        return send_from_directory('compiler-assets/zip-files', 'tc-v1.zip', 
                                    mimetype='application/zip')
    return jsonify({'error': 'TC ZIP not found'}), 404


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)