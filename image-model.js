// Switch Frogify's image model here. Both the Vercel and Netlify
// handlers import this file, so this is the only line you need to change.
//
//   'pro'  — Nano Banana Pro (gemini-3-pro-image)
//            Best quality. About $0.134 per image at 1K or 2K.
//   'lite' — Nano Banana 2 Lite (gemini-3.1-flash-lite-image)
//            Fastest and cheapest. About $0.034 per 1K image.
//
// A GEMINI_IMAGE_MODEL env var set to "pro" or "lite" overrides this.
export const IMAGE_MODEL = 'pro';

const MODELS = {
    pro: {
        id: 'gemini-3-pro-image',
        // 1K and 2K are the same price on Pro, so 2K is the better default.
        imageSize: '2K',
    },
    lite: {
        id: 'gemini-3.1-flash-lite-image',
        // Lite only generates 1K images.
        imageSize: '1K',
    },
};

export function resolveImageModel() {
    const choice = (process.env.GEMINI_IMAGE_MODEL || IMAGE_MODEL).trim().toLowerCase();
    const model = MODELS[choice];
    if (!model) {
        const allowed = Object.keys(MODELS).join(', ');
        throw new Error(`Unknown image model "${choice}". Use one of: ${allowed}.`);
    }
    return { choice, ...model };
}

export function buildImageRequest({ prompt, mimeType, base64Image }) {
    const model = resolveImageModel();
    return {
        model,
        body: {
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
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    imageSize: model.imageSize
                }
            }
        }
    };
}

// Pro is a thinking model and may attach interim images before the final one.
// Prefer the last image that is not a thought; otherwise use the last image.
export function extractGeneratedImage(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
        return null;
    }

    let fallback = null;
    let finalImage = null;

    for (const part of parts) {
        const inlineData = part.inlineData || part.inline_data;
        if (!inlineData?.data) {
            continue;
        }
        const image = {
            data: inlineData.data,
            mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png'
        };
        fallback = image;
        if (!part.thought) {
            finalImage = image;
        }
    }

    return finalImage || fallback;
}
