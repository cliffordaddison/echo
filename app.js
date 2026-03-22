/**
 * Echo — Language Learning Audio Player
 * Core logic: drag-drop, in-browser transcription via Web Worker,
 * real-time word highlighting, sentence navigation
 */

(function () {
    'use strict';

    // ========== DOM References ==========
    const dropView = document.getElementById('drop-view');
    const processingView = document.getElementById('processing-view');
    const playerView = document.getElementById('player-view');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const processingTitle = document.getElementById('processing-title');
    const processingMessage = document.getElementById('processing-message');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const transcriptArea = document.getElementById('transcript-area');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const loopBtn = document.getElementById('loop-btn');
    const speedBtn = document.getElementById('speed-btn');
    const backBtn = document.getElementById('back-btn');
    const seekBarContainer = document.getElementById('seek-bar-container');
    const seekBarFill = document.getElementById('seek-bar-fill');
    const seekBarHandle = document.getElementById('seek-bar-handle');
    const currentTimeLabel = document.getElementById('current-time');
    const totalTimeLabel = document.getElementById('total-time');
    const currentSentenceNum = document.getElementById('current-sentence-num');
    const totalSentencesEl = document.getElementById('total-sentences');
    const playerFileName = document.getElementById('player-file-name');
    const languageBadge = document.getElementById('language-badge');
    const iconPlay = playBtn.querySelector('.icon-play');
    const iconPause = playBtn.querySelector('.icon-pause');

    // ========== State ==========
    let audio = null;
    let transcript = null;
    let sentences = [];
    let currentSentenceIndex = -1;
    let isLooping = false;
    let animFrameId = null;
    let worker = null;
    let isSeeking = false;

    const SPEEDS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];
    let speedIndex = 6; // 1.0x

    // ========== View Switching ==========
    function showView(viewEl) {
        [dropView, processingView, playerView].forEach(v => v.classList.remove('active'));
        viewEl.classList.add('active');
    }

    // ========== Drag & Drop ==========
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, e => { e.preventDefault(); e.stopPropagation(); });
        document.body.addEventListener(event, e => { e.preventDefault(); e.stopPropagation(); });
    });

    dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
    dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFile(files[0]);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    dropZone.addEventListener('click', e => {
        if (e.target !== fileInput) fileInput.click();
    });

    // ========== File Handling ==========
    function handleFile(file) {
        if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|flac|ogg|aac|wma|opus)$/i)) {
            alert('Please drop an audio file (MP3, WAV, M4A, FLAC, OGG, etc.)');
            return;
        }

        // Create object URL for direct audio playback (no server needed!)
        const audioUrl = URL.createObjectURL(file);
        playerFileName.textContent = file.name.replace(/\.[^/.]+$/, '');

        showView(processingView);
        processingTitle.textContent = 'Preparing audio...';
        processingMessage.textContent = file.name;
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        transcribeAudio(file, audioUrl);
    }

    // ========== Client-Side Transcription ==========
    async function transcribeAudio(file, audioUrl) {
        try {
            // Decode audio to 16kHz mono Float32Array (what Whisper expects)
            processingTitle.textContent = 'Decoding audio...';
            processingMessage.textContent = 'Converting to the right format for Whisper';
            progressBar.style.width = '2%';
            progressText.textContent = '2%';

            const arrayBuffer = await file.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const audioData = audioBuffer.getChannelData(0); // mono, 16kHz
            audioCtx.close();

            // Create Web Worker for transcription
            if (worker) worker.terminate();
            worker = new Worker('worker.js', { type: 'module' });

            worker.onmessage = (e) => {
                const msg = e.data;

                switch (msg.type) {
                    case 'status':
                        processingTitle.textContent = getStatusTitle(msg.status);
                        processingMessage.textContent = msg.message || '';
                        progressBar.style.width = msg.progress + '%';
                        progressText.textContent = msg.progress + '%';
                        break;

                    case 'result':
                        const processed = processTranscript(msg.data);
                        initPlayer(audioUrl, processed);
                        break;

                    case 'error':
                        showError(msg.error);
                        break;
                }
            };

            worker.onerror = (err) => {
                showError('Worker error: ' + (err.message || 'Unknown error'));
            };

            // Transfer audio data to worker (zero-copy)
            worker.postMessage(
                { type: 'transcribe', audio: audioData },
                [audioData.buffer]
            );

        } catch (err) {
            showError('Audio processing error: ' + err.message);
        }
    }

    function getStatusTitle(status) {
        const titles = {
            loading_model: 'Loading Whisper model...',
            model_ready: 'Model ready!',
            transcribing: 'Transcribing audio...',
            done: 'Done!'
        };
        return titles[status] || 'Processing...';
    }

    function showError(msg) {
        processingTitle.textContent = 'Something went wrong';
        processingMessage.textContent = '';

        // Clear any existing error
        const existingErr = processingView.querySelector('.error-message');
        const existingBtn = processingView.querySelector('.retry-btn');
        if (existingErr) existingErr.remove();
        if (existingBtn) existingBtn.remove();

        const errDiv = document.createElement('div');
        errDiv.className = 'error-message';
        errDiv.textContent = msg;

        const retryBtn = document.createElement('button');
        retryBtn.className = 'browse-btn retry-btn';
        retryBtn.textContent = 'Try Again';
        retryBtn.style.marginTop = '16px';
        retryBtn.addEventListener('click', () => {
            errDiv.remove();
            retryBtn.remove();
            showView(dropView);
        });

        const container = processingView.querySelector('.processing-container');
        container.appendChild(errDiv);
        container.appendChild(retryBtn);
    }

    // ========== Transcript Post-Processing ==========
    function processTranscript(rawResult) {
        let chunks = rawResult.chunks || [];

        // Ensure word-level granularity (fallback if model returns segments)
        chunks = ensureWordLevel(chunks);

        // Fix French apostrophes and hyphens
        chunks = fixFrenchTokens(chunks);

        // Group into sentences
        const sentenceList = groupIntoSentences(chunks);

        return { sentences: sentenceList, total_sentences: sentenceList.length };
    }

    /**
     * If the model returned segment-level chunks instead of word-level,
     * split them into individual words with interpolated timestamps.
     */
    function ensureWordLevel(chunks) {
        const result = [];
        for (const chunk of chunks) {
            const words = chunk.text.trim().split(/\s+/);
            if (words.length <= 1) {
                result.push(chunk);
            } else {
                const [start, end] = chunk.timestamp;
                const duration = end - start;
                const wordDuration = duration / words.length;
                words.forEach((word, idx) => {
                    result.push({
                        text: word,
                        timestamp: [
                            Math.round((start + idx * wordDuration) * 1000) / 1000,
                            Math.round((start + (idx + 1) * wordDuration) * 1000) / 1000
                        ]
                    });
                });
            }
        }
        return result;
    }

    /**
     * Merge tokens around French apostrophes and hyphens.
     * Turns "d 'être" → "d'être", "qu 'est -ce" → "qu'est-ce", etc.
     */
    function fixFrenchTokens(chunks) {
        const fixed = [];
        let i = 0;

        while (i < chunks.length) {
            let text = chunks[i].text.trim();
            let startTs = chunks[i].timestamp[0];
            let endTs = chunks[i].timestamp[1];

            if (!text) { i++; continue; }

            // Greedily merge with following tokens that start with ' or -
            // or if current token ends with ' or -
            while (i + 1 < chunks.length) {
                const nextText = chunks[i + 1].text.trim();
                if (!nextText) { i++; continue; }

                const shouldMerge = (
                    nextText.startsWith("'") ||
                    nextText.startsWith("\u2019") ||  // right single quote
                    nextText.startsWith("-") ||
                    text.endsWith("'") ||
                    text.endsWith("\u2019") ||
                    text.endsWith("-") ||
                    nextText === "'" ||
                    nextText === "\u2019" ||
                    nextText === "-"
                );

                if (shouldMerge) {
                    text += nextText;
                    endTs = chunks[i + 1].timestamp[1];
                    i++;
                } else {
                    break;
                }
            }

            fixed.push({
                text: text,
                timestamp: [startTs, endTs]
            });
            i++;
        }

        return fixed;
    }

    /**
     * Group word-level chunks into sentences, splitting on . ! ? …
     */
    function groupIntoSentences(words) {
        const sentenceList = [];
        let currentWords = [];
        const sentenceEnd = /[.!?\u2026]$/;

        for (const w of words) {
            const wordObj = {
                word: w.text.trim(),
                start: w.timestamp[0],
                end: w.timestamp[1]
            };

            if (!wordObj.word) continue;

            currentWords.push(wordObj);

            if (sentenceEnd.test(wordObj.word)) {
                sentenceList.push({
                    text: currentWords.map(cw => cw.word).join(' '),
                    start: currentWords[0].start,
                    end: currentWords[currentWords.length - 1].end,
                    words: [...currentWords]
                });
                currentWords = [];
            }
        }

        // Remaining words that didn't end with punctuation
        if (currentWords.length > 0) {
            sentenceList.push({
                text: currentWords.map(cw => cw.word).join(' '),
                start: currentWords[0].start,
                end: currentWords[currentWords.length - 1].end,
                words: [...currentWords]
            });
        }

        return sentenceList;
    }

    // ========== Initialize Player ==========
    function initPlayer(audioUrl, transcriptData) {
        transcript = transcriptData;
        sentences = transcript.sentences || [];

        // Language badge - detect from common patterns
        languageBadge.textContent = 'AUDIO';

        // Total sentences
        totalSentencesEl.textContent = sentences.length;

        // Build transcript DOM
        buildTranscript();

        // Setup audio
        if (audio) {
            audio.pause();
            audio.src = '';
        }
        audio = new Audio(audioUrl);
        audio.preload = 'auto';

        audio.addEventListener('loadedmetadata', () => {
            totalTimeLabel.textContent = formatTime(audio.duration);
        });

        audio.addEventListener('ended', () => {
            if (isLooping && currentSentenceIndex >= 0) {
                audio.currentTime = sentences[currentSentenceIndex].start;
                audio.play();
            } else {
                setPlaying(false);
            }
        });

        audio.addEventListener('error', (e) => {
            console.error('Audio error:', e);
        });

        // Show player view
        showView(playerView);

        // Reset state
        currentSentenceIndex = -1;
        speedIndex = 6;
        speedBtn.textContent = '1.0×';
        isLooping = false;
        loopBtn.classList.remove('active');

        // Start sync loop
        startSyncLoop();
    }

    // ========== Build Transcript DOM ==========
    function buildTranscript() {
        transcriptArea.innerHTML = '';

        sentences.forEach((sentence, sIdx) => {
            const sentenceEl = document.createElement('div');
            sentenceEl.className = 'sentence';
            sentenceEl.dataset.index = sIdx;

            sentence.words.forEach((w, wIdx) => {
                const wordEl = document.createElement('span');
                wordEl.className = 'word';
                wordEl.textContent = w.word;
                wordEl.dataset.sentenceIndex = sIdx;
                wordEl.dataset.wordIndex = wIdx;

                wordEl.addEventListener('click', e => {
                    e.stopPropagation();
                    if (audio) {
                        audio.currentTime = w.start;
                        if (audio.paused) {
                            audio.play();
                            setPlaying(true);
                        }
                    }
                });

                sentenceEl.appendChild(wordEl);

                if (wIdx < sentence.words.length - 1) {
                    sentenceEl.appendChild(document.createTextNode(' '));
                }
            });

            sentenceEl.addEventListener('click', () => {
                if (audio) {
                    audio.currentTime = sentence.start;
                    if (audio.paused) {
                        audio.play();
                        setPlaying(true);
                    }
                }
            });

            transcriptArea.appendChild(sentenceEl);
        });
    }

    // ========== Sync Loop — Real-time Word Highlighting ==========
    function startSyncLoop() {
        if (animFrameId) cancelAnimationFrame(animFrameId);

        function tick() {
            if (audio && !isSeeking) {
                const t = audio.currentTime;
                updateHighlight(t);
                updateSeekBar(t);
                currentTimeLabel.textContent = formatTime(t);
            }
            animFrameId = requestAnimationFrame(tick);
        }

        animFrameId = requestAnimationFrame(tick);
    }

    function updateHighlight(currentTime) {
        // Find current sentence
        let newSentenceIndex = -1;
        for (let i = 0; i < sentences.length; i++) {
            if (currentTime >= sentences[i].start && currentTime <= sentences[i].end + 0.15) {
                newSentenceIndex = i;
                break;
            }
        }

        // If between sentences, find nearest
        if (newSentenceIndex === -1) {
            for (let i = 0; i < sentences.length; i++) {
                if (currentTime < sentences[i].start) {
                    if (i > 0 && currentTime - sentences[i - 1].end < 1.0) {
                        newSentenceIndex = i - 1;
                    }
                    break;
                }
            }
            if (newSentenceIndex === -1 && sentences.length > 0 && currentTime >= sentences[sentences.length - 1].end) {
                newSentenceIndex = sentences.length - 1;
            }
        }

        // Update sentence styling
        if (newSentenceIndex !== currentSentenceIndex) {
            currentSentenceIndex = newSentenceIndex;
            currentSentenceNum.textContent = Math.max(1, currentSentenceIndex + 1);

            const sentenceEls = transcriptArea.querySelectorAll('.sentence');
            sentenceEls.forEach((el, idx) => {
                el.classList.remove('active', 'past');
                if (idx === currentSentenceIndex) {
                    el.classList.add('active');
                } else if (idx < currentSentenceIndex) {
                    el.classList.add('past');
                }
            });

            // Scroll into view
            if (currentSentenceIndex >= 0 && sentenceEls[currentSentenceIndex]) {
                sentenceEls[currentSentenceIndex].scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }

        // Word-level highlighting
        const wordEls = transcriptArea.querySelectorAll('.word');
        wordEls.forEach(wordEl => {
            const sIdx = parseInt(wordEl.dataset.sentenceIndex);
            const wIdx = parseInt(wordEl.dataset.wordIndex);
            const word = sentences[sIdx]?.words[wIdx];
            if (!word) return;

            wordEl.classList.remove('active', 'spoken');

            if (currentTime >= word.start && currentTime <= word.end + 0.05) {
                wordEl.classList.add('active');
            } else if (currentTime > word.end) {
                wordEl.classList.add('spoken');
            }
        });
    }

    // ========== Seek Bar ==========
    function updateSeekBar(currentTime) {
        if (!audio || !audio.duration) return;
        const pct = (currentTime / audio.duration) * 100;
        seekBarFill.style.width = pct + '%';
        seekBarHandle.style.left = pct + '%';
    }

    seekBarContainer.addEventListener('mousedown', startSeek);
    seekBarContainer.addEventListener('touchstart', startSeek, { passive: false });

    function startSeek(e) {
        e.preventDefault();
        isSeeking = true;
        doSeek(e);

        const moveHandler = (ev) => doSeek(ev);
        const upHandler = () => {
            isSeeking = false;
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', upHandler);
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', upHandler);
    }

    function doSeek(e) {
        if (!audio || !audio.duration) return;
        const rect = seekBarContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        audio.currentTime = pct * audio.duration;
        updateSeekBar(audio.currentTime);
        currentTimeLabel.textContent = formatTime(audio.currentTime);
    }

    // ========== Transport Controls ==========
    playBtn.addEventListener('click', () => {
        if (!audio) return;
        if (audio.paused) {
            audio.play().catch(err => console.error('Playback error:', err));
            setPlaying(true);
        } else {
            audio.pause();
            setPlaying(false);
        }
    });

    function setPlaying(isPlaying) {
        iconPlay.style.display = isPlaying ? 'none' : 'block';
        iconPause.style.display = isPlaying ? 'block' : 'none';
    }

    prevBtn.addEventListener('click', () => {
        if (!audio || sentences.length === 0) return;
        if (currentSentenceIndex >= 0) {
            const sentenceStart = sentences[currentSentenceIndex].start;
            if (audio.currentTime - sentenceStart > 1.5) {
                audio.currentTime = sentenceStart;
                if (audio.paused) { audio.play(); setPlaying(true); }
                return;
            }
        }
        const newIdx = Math.max(0, currentSentenceIndex - 1);
        audio.currentTime = sentences[newIdx].start;
        if (audio.paused) { audio.play(); setPlaying(true); }
    });

    nextBtn.addEventListener('click', () => {
        if (!audio || sentences.length === 0) return;
        const newIdx = Math.min(sentences.length - 1, currentSentenceIndex + 1);
        audio.currentTime = sentences[newIdx].start;
        if (audio.paused) { audio.play(); setPlaying(true); }
    });

    loopBtn.addEventListener('click', () => {
        isLooping = !isLooping;
        loopBtn.classList.toggle('active', isLooping);
    });

    // Sentence loop check
    setInterval(() => {
        if (!isLooping || !audio || audio.paused || currentSentenceIndex < 0) return;
        const s = sentences[currentSentenceIndex];
        if (audio.currentTime > s.end + 0.1) {
            audio.currentTime = s.start;
        }
    }, 100);

    speedBtn.addEventListener('click', () => {
        speedIndex = (speedIndex + 1) % SPEEDS.length;
        const speed = SPEEDS[speedIndex];
        if (audio) audio.playbackRate = speed;
        speedBtn.textContent = speed + '\u00d7';
    });

    backBtn.addEventListener('click', () => {
        if (audio) { audio.pause(); audio.src = ''; }
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (worker) { worker.terminate(); worker = null; }
        transcript = null;
        sentences = [];
        currentSentenceIndex = -1;
        showView(dropView);
    });

    // ========== Keyboard Shortcuts ==========
    document.addEventListener('keydown', e => {
        if (!audio) return;
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                playBtn.click();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                prevBtn.click();
                break;
            case 'ArrowRight':
                e.preventDefault();
                nextBtn.click();
                break;
            case 'KeyL':
                e.preventDefault();
                loopBtn.click();
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (speedIndex < SPEEDS.length - 1) {
                    speedIndex++;
                    if (audio) audio.playbackRate = SPEEDS[speedIndex];
                    speedBtn.textContent = SPEEDS[speedIndex] + '\u00d7';
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (speedIndex > 0) {
                    speedIndex--;
                    if (audio) audio.playbackRate = SPEEDS[speedIndex];
                    speedBtn.textContent = SPEEDS[speedIndex] + '\u00d7';
                }
                break;
        }
    });

    // ========== Helpers ==========
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

})();
