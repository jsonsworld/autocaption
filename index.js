require('dotenv').config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const { createClient } = require("@deepgram/sdk");
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// File upload configuration (memory storage works on serverless)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Deepgram client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.post("/upload", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).send("Missing audio file");
        }

        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            req.file.buffer,
            { model: "nova-3" }
        );
        
        if (error) return res.status(500).send('Error transcribing audio');

        const text = result.results.channels[0].alternatives[0].transcript;
        res.send({ text });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).send('Error processing audio');
    }
});

app.post("/translate", async (req, res) => {
    try {
        const { text, targetLang } = req.body;
        
        if (!text || !targetLang) {
            return res.status(400).send('Missing text or target language');
        }

        console.log(`Translating: "${text}" to ${targetLang}`);
        
        // Try MyMemory API first
        try {
            const response = await axios.get('https://api.mymemory.translated.net/get', {
                params: {
                    q: text,
                    langpair: `en|${targetLang}`,
                    de: 'your-email@domain.com' // Optional: add your email for higher limits
                },
                timeout: 10000 // 10 second timeout
            });
            
            console.log('Translation API response:', response.data);
            
            // Check if the response has the expected structure
            if (response.data && response.data.responseData && response.data.responseData.translatedText) {
                return res.send({ translatedText: response.data.responseData.translatedText });
            } else if (response.data && response.data.responseStatus) {
                console.error('Translation API error:', response.data.responseStatus, response.data.responseDetails);
                throw new Error('MyMemory translation failed');
            } else {
                console.error('Unexpected API response structure:', response.data);
                throw new Error('MyMemory translation failed');
            }
        } catch (myMemoryError) {
            console.log('MyMemory failed, trying LibreTranslate...');
            
            // Fallback to LibreTranslate
            try {
                const libreResponse = await axios.post('https://libretranslate.de/translate', {
                    q: text,
                    source: 'en',
                    target: targetLang
                }, {
                    timeout: 15000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (libreResponse.data && libreResponse.data.translatedText) {
                    return res.send({ translatedText: libreResponse.data.translatedText });
                } else {
                    throw new Error('LibreTranslate failed');
                }
            } catch (libreError) {
                console.error('LibreTranslate also failed:', libreError.message);
                throw new Error('All translation services failed');
            }
        }
    } catch (error) {
        console.error("Translation error:", error.message);
        if (error.response) {
            console.error("API response error:", error.response.data);
        }
        res.status(500).send('Error translating text');
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
