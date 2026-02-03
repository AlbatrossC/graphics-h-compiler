from flask import Flask, render_template, send_from_directory, request, jsonify
import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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

@app.route('/api/contact', methods=['POST', 'OPTIONS'])
def contact():
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response, 200

    # Get Discord webhook URL from environment
    discord_webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
    
    if not discord_webhook_url:
        return jsonify({'error': 'Server configuration error'}), 500

    try:
        data = request.get_json()
        
        # Quick validation
        email = data.get('email', '').strip()
        message = data.get('message', '').strip()
        name = data.get('name', '').strip() or 'Anonymous'
        
        if not email or not message:
            return jsonify({'error': 'Email and message are required'}), 400
        
        # Basic email validation
        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Prepare Discord embed payload
        discord_payload = {
            'content': 'New contact query for Graphics.H OC',
            'embeds': [{
                'color': 0x00ff88,  # Green accent color
                'fields': [
                    {
                        'name': 'Name',
                        'value': name,
                        'inline': False
                    },
                    {
                        'name': 'Email',
                        'value': email,
                        'inline': False
                    },
                    {
                        'name': 'Message',
                        'value': message[:1021] + '...' if len(message) > 1024 else message,
                        'inline': False
                    }
                ]
            }]
        }
        
        # Send to Discord (with 5 second timeout)
        try:
            discord_response = requests.post(
                discord_webhook_url,
                json=discord_payload,
                timeout=5
            )
            
            if not discord_response.ok:
                # Log error but still return success to user
                print(f'Discord API error: {discord_response.status_code}')
                
        except requests.Timeout:
            # Timeout - still return success (message was received by our server)
            print('Discord request timeout - message queued')
        except requests.RequestException as e:
            print(f'Discord request error: {e}')
        
        # Success response
        return jsonify({
            'success': True,
            'message': 'Message sent successfully'
        }), 200
        
    except Exception as e:
        print(f'Error processing contact form: {e}')
        return jsonify({'error': 'Failed to send message'}), 500

if __name__ == '__main__':
    # Using port 5000 as default for Flask
    app.run(debug=True, host='0.0.0.0', port=5000)
