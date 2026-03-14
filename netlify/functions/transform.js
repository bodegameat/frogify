// Netlify serverless function for Gemini API image transformation
export const handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Get API key from environment variable
        const apiKey = process.env.GEMINI_API_KEY;
        console.log('API key check:', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey ? apiKey.length : 0,
            apiKeyPrefix: apiKey ? apiKey.substring(0, 10) : 'none',
            allEnvKeys: Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('API'))
        });
        
        if (!apiKey) {
            console.error('GEMINI_API_KEY not found in environment variables');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Server configuration error',
                    message: 'GEMINI_API_KEY environment variable is not set. Please add it in Netlify dashboard under Site settings > Environment variables.'
                })
            };
        }

        // Parse JSON body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (e) {
            console.error('Failed to parse request body:', e.message);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid JSON in request body' })
            };
        }
        
        let base64Image = body.image;
        const mimeType = body.mimeType || 'image/jpeg';
        
        console.log('Request received:', {
            hasImage: !!base64Image,
            imageLength: base64Image ? base64Image.length : 0,
            mimeType: mimeType
        });
        
        if (!base64Image) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No image provided in request body' })
            };
        }
        
        // Remove data URL prefix if present
        base64Image = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

        // Prepare the request to Gemini API
        const model = 'gemini-3.1-flash-image-preview';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const prompt = "Person-frog hybrid: Recreate this scene exactly, but transform the person into a realistic humanoid frog. Keep the pose, the hoodie, and the background identical.";

        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            // REQUIRED: If you don't include this, Gemini only returns text
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]
            }
        };

        // Call Gemini API
        console.log('Calling Gemini API:', {
            model: model,
            url: url.replace(apiKey, '[REDACTED]'),
            requestBodySize: JSON.stringify(requestBody).length
        });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('Gemini API response:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
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
            
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: errorMessage,
                    details: errorDetails
                })
            };
        }

        const data = await response.json();

        // Extract the generated image from response
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || 
            !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
            console.error('Unexpected API response format:', JSON.stringify(data));
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Unexpected response from API' })
            };
        }

        // The API response may have multiple parts - find the one with the image
        let imageData = null;
        let imageMimeType = 'image/png';
        
        for (const part of data.candidates[0].content.parts) {
            // Check for both camelCase (inlineData) and snake_case (inline_data)
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData && inlineData.data) {
                imageData = inlineData.data;
                imageMimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
                break;
            }
        }
        
        if (imageData) {
            // Convert base64 to buffer for Netlify response
            // Netlify functions can return base64 encoded binary data
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': imageMimeType,
                    'Access-Control-Allow-Origin': '*'
                },
                body: imageData,
                isBase64Encoded: true
            };
        } else {
            console.error('No image in API response:', JSON.stringify(data));
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'API did not return an image' })
            };
        }

    } catch (error) {
        console.error('Error in transform function:', error);
        console.error('Error stack:', error.stack);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};
