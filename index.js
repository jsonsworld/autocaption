require('dotenv').config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const { createClient } = require("@deepgram/sdk");
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "public/audio"),
    filename: (req, file, cb) => cb(null, `${Date.now()}.mp3`)
});
const upload = multer({ storage });

// Initialize Deepgram client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.post("/upload", upload.single("audio"), async (req, res) => {
    try {
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            fs.readFileSync(`./public/audio/${req.file.filename}`),
            { model: "nova-3" }
        );
        
        if (error) return res.status(500).send('Error transcribing audio');

        const text = result.results.channels[0].alternatives[0].transcript;
        res.send({ 
            link: `http://localhost:${PORT}/audio/${req.file.filename}`,
            text: text
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).send('Error processing audio');
    }
});

app.post("/translate", async (req, res) => {
    try {
        const { text, targetLang } = req.body;
        const response = await axios.get('https://api.mymemory.translated.net/get', {
            params: {
                q: text,
                langpair: `en|${targetLang}`
            }
        });
        
        if (response.data.responseStatus === 200) {
            res.send({ translatedText: response.data.responseData.translatedText });
        } else {
            throw new Error('Translation failed');
        }
    } catch (error) {
        console.error("Translation error:", error);
        res.status(500).send('Error translating text');
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
