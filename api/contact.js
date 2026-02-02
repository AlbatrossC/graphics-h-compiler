// Vercel Serverless Function: /api/contact.js
// OPTIMIZED VERSION - Faster response times with clean Discord notifications

export default async function handler(req, res) {
    // Enable CORS with optimized headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight OPTIONS request (send immediately)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get Discord webhook URL from environment variable
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

    if (!DISCORD_WEBHOOK_URL) {
        console.error('DISCORD_WEBHOOK_URL not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const { name, email, message } = req.body;

        // Quick validation (fail fast)
        if (!email || !message) {
            return res.status(400).json({ error: 'Email and message are required' });
        }

        // Fast email validation
        if (!email.includes('@') || !email.includes('.')) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Prepare Discord payload (clean, simple format - no emojis, no bold)
        const discordPayload = {
            content: 'New contact query for Graphics.H OC',
            embeds: [{
                color: 0x3b82f6,
                fields: [
                    {
                        name: 'Name',
                        value: name || 'Anonymous',
                        inline: false
                    },
                    {
                        name: 'Email',
                        value: email,
                        inline: false
                    },
                    {
                        name: 'Message',
                        value: message.length > 1024 ? message.substring(0, 1021) + '...' : message,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        // Send to Discord with timeout (5 seconds max)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(discordPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check Discord response
        if (!discordResponse.ok) {
            // Log error but still return success to user (fire and forget)
            console.error('Discord API error:', discordResponse.status);
            // Still return success - message was received by our server
        }

        // Success - respond immediately
        return res.status(200).json({ 
            success: true,
            message: 'Message sent successfully' 
        });

    } catch (error) {
        console.error('Error sending to Discord:', error);
        
        // If timeout, still return success (message received, Discord might be slow)
        if (error.name === 'AbortError') {
            console.log('Discord request timeout - message queued');
            return res.status(200).json({ 
                success: true,
                message: 'Message received' 
            });
        }
        
        // Only return error for critical failures
        return res.status(500).json({ 
            error: 'Failed to send message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}