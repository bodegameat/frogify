# Frogify 🐸

Transform yourself into a frog using Gemini AI! A simple mobile web app that captures photos and uses AI to turn people into frogs.

## Features

- 📸 Mobile camera access
- 🤖 AI-powered image transformation using Gemini 2.5 Flash Image
- 📱 Fully responsive mobile design
- ⚡ Fast and simple interface

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your API key:**
   Create a `.env` file in the root directory:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

3. **Run the development server:**
   ```bash
   npm start
   ```

4. **Open in your browser:**
   - Local: `http://localhost:3000`
   - On mobile: Use your computer's IP address (e.g., `http://192.168.1.100:3000`)

## Usage

1. Open the app on your mobile device
2. Allow camera permissions when prompted
3. Position yourself in the camera view
4. Tap the capture button
5. Wait for the AI transformation
6. View your frog self!

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Add `GEMINI_API_KEY` to your Vercel environment variables
4. Deploy!

The app is configured for Vercel serverless functions in `vercel.json`.

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Backend:** Node.js/Express (local) or Vercel serverless functions
- **AI:** Google Gemini 2.5 Flash Image API

## Notes

- The API key is stored securely in environment variables
- Camera access requires HTTPS in production (or localhost for development)
- Image processing may take a few seconds depending on network speed
