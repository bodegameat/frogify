// Serverless function for Gemini API image transformation
import { buildImageRequest, extractGeneratedImage } from '../image-model.js';

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Origin check — only allow requests from the real site
    const origin = req.headers.origin || req.headers.referer || '';
    const allowedOrigins = ['https://frogify.org', 'https://frogify.netlify.app', 'http://localhost'];
    if (!allowedOrigins.some(o => origin.startsWith(o))) {
        console.warn('Blocked request from disallowed origin:', origin);
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Payload size limit — reject anything over 15MB
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (rawBody && rawBody.length > 15 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image too large. Please use a smaller photo.' });
    }

    try {
        // Get API key from environment variable
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            console.error('GEMINI_API_KEY not found in environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Handle JSON body with base64 image
        let base64Image, mimeType;
        
        // Parse JSON body
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        base64Image = body.image;
        mimeType = body.mimeType || 'image/jpeg';
        
        if (!base64Image) {
            return res.status(400).json({ error: 'No image provided in request body' });
        }
        // Remove data URL prefix if present
        base64Image = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
        
        // Legacy multipart support (not used in current implementation)
        if (false) {
            // Multipart form data - parse manually for Vercel
            const rawBody = Buffer.from(req.body, req.headers['content-type']?.includes('base64') ? 'base64' : 'binary');
            const boundary = req.headers['content-type']?.split('boundary=')[1];
            
            if (!boundary) {
                return res.status(400).json({ error: 'Invalid form data' });
            }
            
            const parts = rawBody.toString('binary').split(`--${boundary}`);
            let found = false;
            
            for (const part of parts) {
                if (part.includes('name="image"')) {
                    const headerEnd = part.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                        let imageData = part.substring(headerEnd + 4);
                        imageData = imageData.replace(/--\r\n?$/, '').trim();
                        const imageBuffer = Buffer.from(imageData, 'binary');
                        base64Image = imageBuffer.toString('base64');
                        
                        const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
                        mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found || !base64Image) {
                return res.status(400).json({ error: 'No image provided in form data' });
            }
        }

        // Model choice lives in image-model.js (pro or lite).
        const prompt = "Person-frog hybrid: Recreate this scene exactly, but transform the person into a realistic humanoid frog. Keep the pose, clothes, and the background identical.";
        const { model, body: requestBody } = buildImageRequest({ prompt, mimeType, base64Image });
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`;

        // Call Gemini API
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', errorText);
            
            // Parse error response for better error messages
            let errorMessage = 'Failed to transform image';
            let errorDetails = errorText;
            
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    if (errorJson.error.code === 429) {
                        errorMessage = 'API quota exceeded. Please check your Gemini API plan and billing settings.';
                        if (errorJson.error.message) {
                            errorDetails = errorJson.error.message;
                        }
                    } else if (errorJson.error.message) {
                        errorMessage = errorJson.error.message;
                    }
                }
            } catch (e) {
                // If parsing fails, use the raw error text
            }
            
            return res.status(response.status).json({ 
                error: errorMessage,
                details: errorDetails
            });
        }

        const data = await response.json();
        const generated = extractGeneratedImage(data);

        if (generated) {
            const imageBuffer = Buffer.from(generated.data, 'base64');
            res.setHeader('Content-Type', generated.mimeType);
            res.setHeader('Content-Length', imageBuffer.length);
            return res.status(200).send(imageBuffer);
        } else {
            // If no image in response, return error
            console.error('No image in API response:', JSON.stringify(data));
            return res.status(500).json({ error: 'API did not return an image' });
        }

    } catch (error) {
        console.error('Error in transform function:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
