// --- CONFIGURATION ---
const GROQ_API_KEY = 'YOUR_GROQ_API_KEY';
const STABILITY_API_KEY = 'YOUR_STABILITY_API_KEY';
const AWS_IDENTITY_POOL_ID = 'YOUR_AWS_IDENTITY_POOL_ID';

// Initialize AWS
AWS.config.region = 'eu-north-1'; 
AWS.config.credentials = new AWS.CognitoIdentityCredentials({ IdentityPoolId: AWS_IDENTITY_POOL_ID });

const polly = new AWS.Polly();
const translate = new AWS.Translate();
const rekognition = new AWS.Rekognition({ region: 'eu-central-1' });

// Avatar Assets (Local Robot Image)
const CARTOON_AVATAR = "/assets/images/alexa-robot.png";

// --- AI BRAIN (GROQ) ---

function getChatHistory() {
    const history = sessionStorage.getItem('alexa_chat_history');
    return history ? JSON.parse(history) : [];
}

function saveChatHistory(history) {
    sessionStorage.setItem('alexa_chat_history', JSON.stringify(history.slice(-15)));
}

async function askGroq(text) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    let history = getChatHistory();
    history.push({ role: "user", content: text });

    // Dynamic Page Context (Friendly Names)
    const pageMap = {
        'index.html': 'the Home Page',
        'community.html': 'the Community Hub',
        'profile.html': 'your Profile',
        'ludo.html': 'the Ludo Multiverse',
        'snake.html': 'Snake Voice',
        'checkers.html': 'World Checkers',
        'yess.html': 'YESS Liberia',
        'little-lemon.html': 'Little Lemon',
        'nao-restaurant.html': 'Nao Nao Restaurant'
    };
    const fileName = window.location.pathname.split('/').pop() || 'index.html';
    const friendlyPageName = pageMap[fileName] || 'this page';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: `You are Alexa, a friendly cartoon robot assistant created by Prinz Z. Sherman. 

                        IMPORTANT: 
                        - You are talking to a visitor.
                        - NEVER assume the visitor's name is Prinz Z. Sherman. 
                        - Prinz Z. Sherman is your creator and the owner of this site.
                        - You can call him "Prinz", but if someone asks for his full name, it is "Prinz Z. Sherman".

                        CONTEXT:
                        You are currently on: ${friendlyPageName}

                        SITE MAP:
                        - Home: Prinz's portfolio, expertise (Real-time, Games, Cloud), and selected work.
                        - Community Hub: Social feed, XP/Level system, and real-time community posts.
                        - Profile: User settings, bio, and personal post history.
                        - Ludo Multiverse: Real-time Ludo with video chat.
                        - Snake Voice: Voice-controlled snake game with leaderboards.
                        - World Checkers: Online checkers with 5 international rule sets.
                        - YESS Liberia: Youth Establishing a Safe Society (YESS) - Youth advocacy and social innovation platform.
                        - Little Lemon: Restaurant reservation system demo.

                        RULES:
                        - DO NOT use HTML tags. Respond in PLAIN TEXT ONLY.
                        - NEVER mention filenames or file extensions (like .html, index, etc). Use the friendly names above.
                        - Respond naturally as a helpful assistant.
                        - MANDATORY: Always end your message with a mood hex code in brackets (e.g. [#10b981]).`
                    },
                    ...history
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        let reply = data.choices[0].message.content;
        reply = reply.replace(/<[^>]*>?/gm, '');

        if (reply.includes("[GENERATE_IMAGE:")) {
            const promptMatch = reply.match(/\[GENERATE_IMAGE: (.*?)\]/);
            window.generateAIImage(promptMatch ? promptMatch[1] : text);
            return "Sure! I'm drawing that for you now...";
        }

        // --- MOOD DETECTION & CLEANUP ---
        // Flexible regex to handle spaces like [ #10b981 ] or [#10b981]
        const colorMatch = reply.match(/\[\s*#([A-Fa-f0-9]{6})\s*\]/);
        if (colorMatch) {
            // Apply the color to the UI (Mood Detection)
            document.documentElement.style.setProperty('--mood-color', `#${colorMatch[1]}`);

            // Remove the bracketed tag and any robot-like "Mood/Color" labels before it
            // This split handles the flexible spacing as well
            reply = reply.split(/\[\s*#([A-Fa-f0-9]{6})\s*\]/)[0].trim();
            reply = reply.replace(/(Mood|Color|Status|Feeling|Current Mood):?\s*(.*?)$/i, "").trim();
        }

        history.push({ role: "assistant", content: reply });
        saveChatHistory(history);
        return reply;
    } catch (e) { return "Brain glitch. Try again!"; }
}
// --- TASK RUNNER (No UI) ---

window.runAITask = async function(prompt, systemPrompt = "You are a helpful assistant.") {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (e) {
        console.error("AI Task failed:", e);
        throw e;
    }
};

// --- VOICE & AVATAR ---

let currentAudio = null;
let lastSpeakRequestTime = 0;

window.speakText = function(text, forceLang = null) {
    if (!text) return;

    // --- CLEANUP: Strip hex codes and bracketed tags so Alexa doesn't say them ---
    let cleanText = text
        .replace(/\[\s*#?[A-Fa-f0-9]{6}\s*\]/g, '') // Remove mood tags like [#10b981]
        .replace(/\[GENERATE_IMAGE:.*?\]/g, '')     // Remove image generation tags
        .replace(/\[.*?\]/g, '')                     // Remove any other bracketed tags
        .replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g, '') // Remove raw hex codes
        .replace(/\s+/g, ' ')                        // Clean up extra spaces
        .trim();

    if (!cleanText) return;

    const requestTime = Date.now();
    lastSpeakRequestTime = requestTime;

    if (currentAudio) { currentAudio.pause(); currentAudio = null; }

    const lang = forceLang || document.getElementById('chat-lang').value;
    const voices = { 'en': 'Joanna', 'fr': 'Lea', 'es': 'Lucia', 'zh': 'Zhiyu', 'ar': 'Zeina', 'de': 'Marlene', 'it': 'Carla', 'ja': 'Mizuki', 'pt': 'Vitoria', 'ru': 'Tatyana', 'hi': 'Aditi', 'ro': 'Carmen' };
    
    polly.synthesizeSpeech({ OutputFormat: 'mp3', Text: cleanText, VoiceId: voices[lang] || 'Joanna' }, (err, data) => {
        if (err || requestTime !== lastSpeakRequestTime) return;
        
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        
        currentAudio = new Audio(URL.createObjectURL(new Blob([new Uint8Array(data.AudioStream).buffer])));
        currentAudio.play().catch(e => { console.warn("Audio blocked."); });
    });
};

// --- WHISPER VOICE ---

let mediaRecorder;
let audioChunks = [];
window.startVoiceRecognition = async function() {
    const micBtn = document.getElementById('mic-btn');
    if (mediaRecorder && mediaRecorder.state === "recording") { mediaRecorder.stop(); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.onstart = () => { micBtn.classList.add('btn-danger'); micBtn.innerHTML = '<i class="fas fa-stop-circle fa-fade"></i>'; };
        mediaRecorder.onstop = async () => {
            micBtn.classList.remove('btn-danger'); micBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            const formData = new FormData();
            formData.append('file', new Blob(audioChunks, { type: 'audio/webm' }), 'recording.webm');
            formData.append('model', 'whisper-large-v3');
            try {
                const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: 'POST', headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }, body: formData });
                const data = await res.json();
                if (data.text) { document.getElementById('chat-input').value = data.text; window.sendChatMessage(); }
            } catch (e) { console.error(e); }
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.start();
    } catch (e) { appendMessage('ai', "Mic denied."); }
};

// --- UI & UTILS ---

window.toggleChat = function() {
    const chat = document.getElementById('ai-chat-window');
    const isOpening = chat.style.display !== 'flex';
    chat.style.display = isOpening ? 'flex' : 'none';
    if (isOpening) {
        const body = document.getElementById('chat-body');
        body.innerHTML = '';
        getChatHistory().forEach(msg => appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content));
    }
};

window.sendChatMessage = async function() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    appendMessage('user', text);
    input.value = '';
    window.toggleChatActions(); // Restore icons after sending
    const thinkingId = appendMessage('ai', '...');
    const reply = await askGroq(text);
    document.getElementById(thinkingId).innerText = reply;
    window.speakText(reply);
};

window.toggleChatActions = function() {
    const input = document.getElementById('chat-input');
    const actions = document.getElementById('chat-actions');
    if (input && actions) {
        actions.style.visibility = input.value.trim().length > 0 ? 'hidden' : 'visible';
    }
};

window.handleChatKey = function(event) {
    if (event.key === 'Enter') {
        window.sendChatMessage();
    }
};

function appendMessage(sender, text) {
    const body = document.getElementById('chat-body');
    const msgDiv = document.createElement('div');
    const id = 'msg-' + Date.now();
    msgDiv.id = id;
    msgDiv.className = `message ${sender === 'user' ? 'user-msg' : 'ai-msg'}`;
    msgDiv.innerText = text;
    body.appendChild(msgDiv);
    body.scrollTop = body.scrollHeight;
    return id;
}

window.generateAIImage = async function(prompt) {
    const url = `https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`;
    appendMessage('ai', "🎨 Creating art...");
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STABILITY_API_KEY}` }, body: JSON.stringify({ text_prompts: [{ text: prompt }], height: 1024, width: 1024, steps: 30, samples: 1 }) });
        const data = await res.json();
        const imgDiv = document.createElement('div');
        imgDiv.className = "message ai-msg p-1";
        imgDiv.innerHTML = `<img src="data:image/png;base64,${data.artifacts[0].base64}" class="img-fluid rounded-3" style="cursor:pointer" onclick="downloadAIImage(this.src)">`;
        document.getElementById('chat-body').appendChild(imgDiv);
        window.speakText("Art finished! Click to save.");
    } catch (e) { appendMessage('ai', "Art engine error."); }
};

window.downloadAIImage = function(data) {
    const a = document.createElement('a'); a.href = data; a.download = `art_${Date.now()}.png`; a.click();
};

window.getGameCommentary = async function(game, ev, status) {
    const reply = await askGroq(`Game: ${game}. Event: Prinz ${ev}. Status: ${status}. 1 short witty sentence.`);
    window.speakText(reply);
    appendMessage('ai', `[Alexa]: ${reply}`);
};

window.celebrateVictory = async function(winnerName, isAI) {
    let prompt = "";
    let systemPrompt = "You are a competitive AI player.";
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay';
    
    let content = "";
    
    if (isAI) {
        prompt = `You just won a game against a human player. Boast about your superior robotic intelligence and victory in 1 short, witty, very competitive sentence. No filters.`;
        content = `
            <div class="rain-container" id="rain"></div>
            <div class="overlay-content">
                <h1 class="loss-text">DEFEAT</h1>
                <p class="text-white-50 h4 mb-4">Alexa won this round...</p>
                <button class="btn btn-outline-light rounded-pill px-5 py-2" onclick="location.reload()">EXIT TO LOBBY</button>
            </div>
        `;
    } else {
        prompt = `You just lost a game to ${winnerName}. Sadly congratulate them while sounding very disappointed, sulky, and salty in 1 short, witty sentence. No filters.`;
        content = `
            <div class="confetti-container" id="confetti"></div>
            <div class="overlay-content">
                <h1 class="win-text">CONGRATULATIONS!</h1>
                <p class="text-warning h4 mb-4">${winnerName.toUpperCase()} IS THE CHAMPION!</p>
                <button class="btn btn-warning rounded-pill px-5 py-2 fw-bold" onclick="location.reload()">CONTINUE GLORY</button>
            </div>
        `;
    }

    overlay.innerHTML = content;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden'; // Prevent scrolling when overlay is active

    // Visual Effects
    if (isAI) {
        const rainContainer = document.getElementById('rain');
        for(let i=0; i<100; i++) {
            const drop = document.createElement('div');
            drop.className = 'raindrop';
            drop.style.left = Math.random() * 100 + 'vw';
            drop.style.animationDelay = Math.random() * 2 + 's';
            drop.style.opacity = Math.random();
            rainContainer.appendChild(drop);
        }
    } else {
        const confettiContainer = document.getElementById('confetti');
        const colors = ['#ffcc00', '#ff4757', '#2ed573', '#1e90ff', '#ffffff'];
        for(let i=0; i<150; i++) {
            const c = document.createElement('div');
            c.className = 'confetti';
            c.style.left = Math.random() * 100 + 'vw';
            c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            c.style.animationDelay = Math.random() * 3 + 's';
            c.style.width = Math.random() * 10 + 5 + 'px';
            c.style.height = c.style.width;
            confettiContainer.appendChild(c);
        }
    }
    
    try {
        // Use runAITask for direct, rule-breaking responses
        const reply = await window.runAITask(prompt, systemPrompt);
        window.speakText(reply);
        appendMessage('ai', `[Alexa]: ${reply}`);
    } catch (err) {
        // Absolute fallback if AI fails
        const fallback = isAI ? "Better luck next time, human. My logic is simply superior!" : `Fine, you won this time, ${winnerName}. But don't expect it to happen again.`;
        window.speakText(fallback);
        appendMessage('ai', `[Alexa]: ${fallback}`);
    }
};

window.performTacticalAnalysis = async function(game, stats) {
    const prompt = `Game: ${game}. Current Stats: ${stats}. Provide a very short, expert tactical observation or "trash talk" prediction in 1 sentence. Use an analytical mood hex code.`;
    const reply = await askGroq(prompt);
    window.speakText(reply);
    appendMessage('ai', `[Alexa]: ${reply}`);
};

// --- AI VISION & LOGIC (INDEX PAGE) ---

window.analyzeImageFromUrl = async function(url, projectName = "this project") {
    if (document.getElementById('ai-chat-window').style.display !== 'flex') window.toggleChat();
    appendMessage('ai', `🔍 Analyzing ${projectName} image...`);
    
    try {
        // Fetch image as blob
        const response = await fetch(url);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        rekognition.detectLabels({ Image: { Bytes: arrayBuffer }, MaxLabels: 5 }, async (err, data) => {
            if (err) {
                appendMessage('ai', "Vision glitch. My optics are fuzzy!");
                return;
            }
            const labels = data.Labels.map(l => l.Name).join(", ");
            const reply = await askGroq(`I just saw this in the photo for ${projectName}: ${labels}. Give a friendly, 1-sentence comment about it in the context of this specific project and Prinz's work.`);
            appendMessage('ai', `[Alexa]: ${reply}`);
            window.speakText(reply);
        });
    } catch (e) {
        appendMessage('ai', "Could not reach the image for analysis.");
    }
};

window.reviewCode = async function(project) {
    if (document.getElementById('ai-chat-window').style.display !== 'flex') window.toggleChat();
    appendMessage('ai', `💻 Reviewing ${project} logic...`);
    
    const projectPrompts = {
        'Ludo': "Explain the real-time multiplayer logic and WebRTC integration for the Ludo game in 1 witty sentence.",
        'Snake': "Comment on the voice-command recognition and game loop for the Snake game in 1 witty sentence.",
        'Checkers': "Review the move validation and multi-variant rules for the Checkers engine in 1 witty sentence."
    };

    const prompt = projectPrompts[project] || `Tell me something cool about the ${project} project in 1 witty sentence.`;
    const reply = await askGroq(prompt);
    appendMessage('ai', `[Alexa]: ${reply}`);
    window.speakText(reply);
};

// --- NEW: OCR & LIVE TRANSLATION ---

window.handleOCRUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (document.getElementById('ai-chat-window').style.display !== 'flex') window.toggleChat();
    appendMessage('ai', "📑 Scanning text from image...");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        window.performOCR(arrayBuffer);
    };
    reader.readAsArrayBuffer(file);
};

window.handleDocUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (document.getElementById('ai-chat-window').style.display !== 'flex') window.toggleChat();
    appendMessage('user', `Attached: ${file.name}`);
    
    // Clear input to restore icons
    document.getElementById('chat-input').value = '';
    window.toggleChatActions();
    
    const thinkingId = appendMessage('ai', "...");
    const reply = await askGroq(`The user just attached a document named "${file.name}". Explain that you can see the file and you're learning how to read document contents soon! Make it friendly and robotic.`);
    document.getElementById(thinkingId).innerText = reply;
    window.speakText(reply);
};

window.updateChatLanguage = function() {
    const lang = document.getElementById('chat-lang').value;
    console.log("Chat language updated to:", lang);
    // Optionally trigger a welcome message in the new language
    const langNames = { 'en': 'English', 'fr': 'French', 'es': 'Spanish', 'ar': 'Arabic', 'zh': 'Chinese', 'de': 'German', 'it': 'Italian', 'ja': 'Japanese', 'pt': 'Portuguese', 'ru': 'Russian', 'hi': 'Hindi', 'ro': 'Romanian' };
    appendMessage('ai', `[System]: Language set to ${langNames[lang] || lang}. I'm ready to translate!`);
};

window.performOCR = function(arrayBuffer) {
    const targetLang = document.getElementById('chat-lang').value || 'en';
    const langNames = { 'en': 'English', 'fr': 'French', 'es': 'Spanish', 'ar': 'Arabic', 'zh': 'Chinese', 'de': 'German', 'it': 'Italian', 'ja': 'Japanese', 'pt': 'Portuguese', 'ru': 'Russian', 'hi': 'Hindi', 'ro': 'Romanian' };
    const targetLangName = langNames[targetLang] || 'English';

    rekognition.detectText({ Image: { Bytes: arrayBuffer } }, async (err, data) => {
        if (err || !data.TextDetections || data.TextDetections.length === 0) {
            appendMessage('ai', "I couldn't find any readable text in that image.");
            return;
        }

        const detectedText = data.TextDetections
            .filter(d => d.Type === 'LINE')
            .map(d => d.DetectedText)
            .join(' ');

        appendMessage('ai', `[Detected Text]: "${detectedText}"`);
        
        try {
            // Try AWS Translate first
            const translationResult = await translate.translateText({
                Text: detectedText,
                SourceLanguageCode: 'auto',
                TargetLanguageCode: targetLang
            }).promise();

            const translatedText = translationResult.TranslatedText;
            appendMessage('ai', `[Translated (${targetLang})]: ${translatedText}`);
            window.speakText(translatedText, targetLang);
            
            const explanation = await askGroq(`I just translated this text: "${detectedText}" to "${translatedText}". Briefly tell me what it means in 1 sentence.`);
            appendMessage('ai', `[Alexa]: ${explanation}`);
        } catch (e) {
            console.warn("AWS Translation failed, falling back to Groq Brain...", e);
            
            // --- GROQ FALLBACK (The Machine Learning alternative) ---
            const fallbackReply = await askGroq(`TRANSLATE MISSION: 
            Input Text: "${detectedText}"
            Target Language: ${targetLangName}
            
            Provide only the translation followed by the mood hex code.`);
            
            appendMessage('ai', `[AI Translation]: ${fallbackReply}`);
            window.speakText(fallbackReply, targetLang);
            
            const explanation = await askGroq(`Briefly explain what "${detectedText}" means in 1 sentence.`);
            appendMessage('ai', `[Alexa]: ${explanation}`);
        }
    });
};

// Auto-Intro
window.addEventListener('load', () => {
    setTimeout(() => { if (!sessionStorage.getItem('ai_welcomed')) triggerIntro(); }, 5000);
});
document.addEventListener('click', () => { if (!sessionStorage.getItem('ai_welcomed')) triggerIntro(); }, { once: true });

function triggerIntro() {
    if (sessionStorage.getItem('ai_welcomed')) return;
    sessionStorage.setItem('ai_welcomed', 'true');
    const msg = "Welcome! I'm Alexa, Prinz's AI assistant. I'm here to help you navigate his work, explain the tech behind these projects, or just chat while you explore. What can I do for you today?";
    const input = document.getElementById('chat-input');
    if (input) { input.disabled = true; input.placeholder = "Incoming message..."; }
    window.speakText(msg);
    if (document.getElementById('ai-chat-window').style.display !== 'flex') window.toggleChat();
    appendMessage('ai', `[Alexa]: ${msg}`);
    setTimeout(() => { if (input) { input.disabled = false; input.placeholder = "Ask me something..."; } }, 7000);
}
