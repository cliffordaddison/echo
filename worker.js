/**
 * Echo — Transcription Web Worker
 * Runs Whisper via Transformers.js in a background thread
 */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

// Use remote models only (cached in browser after first download)
env.allowLocalModels = false;

let transcriber = null;
const downloadProgress = {};

self.addEventListener('message', async (e) => {
    const { type, audio, language } = e.data;

    if (type === 'transcribe') {
        try {
            // Step 1: Load Whisper model (downloads once, cached after)
            if (!transcriber) {
                self.postMessage({
                    type: 'status',
                    status: 'loading_model',
                    progress: 5,
                    message: 'Loading Whisper model (cached after first download)...'
                });

                transcriber = await pipeline(
                    'automatic-speech-recognition',
                    'Xenova/whisper-base',
                    {
                        progress_callback: (data) => {
                            if (data.status === 'progress' && data.file) {
                                downloadProgress[data.file] = {
                                    loaded: data.loaded || 0,
                                    total: data.total || 1
                                };

                                let totalLoaded = 0, totalSize = 0;
                                for (const key in downloadProgress) {
                                    totalLoaded += downloadProgress[key].loaded;
                                    totalSize += downloadProgress[key].total;
                                }

                                const pct = totalSize > 0
                                    ? Math.round((totalLoaded / totalSize) * 100)
                                    : 0;

                                let progObj = Math.max(5, Math.min(50, pct * 0.45 + 5));
                                let roundedProg = Math.round(progObj);

                                self.postMessage({
                                    type: 'status',
                                    status: 'loading_model',
                                    progress: roundedProg,
                                    message: `Downloading model... ${pct}%`
                                });
                            }
                        }
                    }
                );

                self.postMessage({
                    type: 'status',
                    status: 'model_ready',
                    progress: 52,
                    message: 'Model loaded! Starting transcription...'
                });
            }

            // Step 2: Transcribe with word-level timestamps
            self.postMessage({
                type: 'status',
                status: 'transcribing',
                progress: 55,
                message: 'Transcribing audio (this may take a moment)...'
            });

            let transcribeOptions = {
                task: 'transcribe',
                return_timestamps: 'word',
                chunk_length_s: 30,
                stride_length_s: 5,
            };
            if (language && language !== 'auto') {
                transcribeOptions.language = language;
            }

            const result = await transcriber(audio, transcribeOptions);

            // Step 3: Done
            self.postMessage({
                type: 'status',
                status: 'done',
                progress: 100,
                message: 'Transcription complete!'
            });

            self.postMessage({ type: 'result', data: result });

        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }
});
