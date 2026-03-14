// Simple Express server for local development
import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import transformHandler from './api/transform.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// API endpoint
app.post('/api/transform', async (req, res) => {
    // Convert Express req/res to Vercel format
    const vercelReq = {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(req.body)
    };
    
    let statusCode = 200;
    let headers = {};
    
    const vercelRes = {
        status: (code) => {
            statusCode = code;
            return vercelRes;
        },
        setHeader: (name, value) => {
            headers[name] = value;
        },
        json: (data) => {
            Object.keys(headers).forEach(key => res.setHeader(key, headers[key]));
            res.status(statusCode).json(data);
        },
        send: (data) => {
            Object.keys(headers).forEach(key => res.setHeader(key, headers[key]));
            res.status(statusCode).send(data);
        }
    };
    
    await transformHandler(vercelReq, vercelRes);
});

// Serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Frogify app running at http://localhost:${PORT}`);
    console.log('Make sure to set GEMINI_API_KEY in your .env file');
});
