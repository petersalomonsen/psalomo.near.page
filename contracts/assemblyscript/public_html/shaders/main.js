import { setupWebGL } from './shadersource.js';
import { songdata } from './song.js';

const scrollTextElement = document.querySelector('#scrolltext');
let scrollTextElementPos = document.documentElement.clientWidth;
scrollTextElement.style.left = `${scrollTextElementPos}px`;

export async function decodeBufferFromPNG(url) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    await img.decode();
    const canv = document.createElement('canvas');
    canv.width = img.width;
    canv.height = img.height;

    const ctx = canv.getContext('2d');
    // Draw image to canvas
    ctx.drawImage(img, 0, 0);
    // Retrieve RGBA data
    let data = ctx.getImageData(0, 0, img.width, img.height).data;
    // Only return R channel (identical to G and B channels)
    data = data.filter((_, idx) => { return idx % 4 === 0 });
    // Extract byte count from first 4 bytes (32-bit, unsigned, little endian)
    const length = data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24);

    return data.slice(4, length + 4);
}

window.play = async (disablescrolltext) => {
    document.querySelector('#controlpanel').remove();
    const context = new AudioContext();
    context.resume();
    
    if (disablescrolltext) {
        scrollTextElement.remove();
    } else {
        enableScrollText();
    }

    const wasm_synth_bytes = await decodeBufferFromPNG(songdata);
    await context.audioWorklet.addModule(audioWorkletProcessorUrl);
    const audioWorkletNode = new AudioWorkletNode(context, 'asc-midisynth-audio-worklet-processor', {
        outputChannelCount: [2]
    });
    audioWorkletNode.port.start();
    audioWorkletNode.port.postMessage({ wasm: wasm_synth_bytes });
    audioWorkletNode.connect(context.destination);

    let currentTime = 0;
    let previousTime;
    let targetNoteStates = new Array(127).fill(-1);
    function updateTimeIndicator() {
        requestAnimationFrame(() => {
            audioWorkletNode.port.postMessage({ currentTime: true });
            audioWorkletNode.port.onmessage = (msg) => {
                if (msg.data.currentTime !== undefined) {
                    currentTime = msg.data.currentTime / 1000;
                    if (currentTime !== previousTime) {
                        previousTime = currentTime;
                        const voiceStatusArr = msg.data.activeVoicesStatusSnapshot;
                        targetNoteStates.fill(-1);
                        for (let n = 0; n < voiceStatusArr.length; n += 3) {
                            targetNoteStates[voiceStatusArr[n + 1]] = ((voiceStatusArr[n + 2] / 127) * 2 - 1);
                        }
                    }
                }
                if (!disablescrolltext) {
                    scrollTextElement.style.left = `${scrollTextElementPos--}px`;
                    if (scrollTextElementPos === -scrollTextElement.clientWidth) {
                        scrollTextElementPos = document.documentElement.clientWidth;
                    }
                }
                updateTimeIndicator();
            }
        });
    }
    updateTimeIndicator();
    setupWebGL(() => currentTime, () => targetNoteStates);
}

function audioWorkletProcessorSource() {
    const SAMPLE_FRAMES = 128;

    class AssemblyScriptMidiSynthAudioWorkletProcessor extends AudioWorkletProcessor {

        constructor() {
            super();
            this.processorActive = true;
            this.playSong = true;

            this.port.onmessage = async (msg) => {
                if (msg.data.wasm) {
                    this.wasmInstancePromise = WebAssembly.instantiate(msg.data.wasm, {
                        environment: {
                            SAMPLERATE: sampleRate || AudioWorkletGlobalScope.sampleRate
                        }
                    });
                    this.wasmInstance = (await this.wasmInstancePromise).instance.exports;

                    this.port.postMessage({ wasmloaded: true });
                }

                if (this.wasmInstance) {
                    if (msg.data.toggleSongPlay !== undefined) {
                        if (msg.data.toggleSongPlay === false) {
                            this.wasmInstance.allNotesOff();
                            this.playSong = false;
                        } else {
                            this.playSong = true;
                        }
                    }

                    if (msg.data.seek !== undefined) {
                        this.wasmInstance.allNotesOff();
                        this.wasmInstance.seek(msg.data.seek);
                    }

                    if (msg.data.currentTime) {
                        this.port.postMessage({
                            currentTime: this.wasmInstance.currentTimeMillis.value,
                            activeVoicesStatusSnapshot: new Uint8Array(this.wasmInstance.memory.buffer,
                                this.wasmInstance.getActiveVoicesStatusSnapshot(),
                                32 * 3).slice(0)
                        });
                    }
                }

                if (msg.data.midishortmsg) {
                    (await this.wasmInstancePromise).instance.exports.shortmessage(
                        msg.data.midishortmsg[0],
                        msg.data.midishortmsg[1],
                        msg.data.midishortmsg[2]
                    );
                }

                if (msg.data.terminate) {
                    this.processorActive = false;
                    this.port.close();
                }
            };
            this.port.start();
        }

        process(inputs, outputs, parameters) {
            const output = outputs[0];

            if (this.wasmInstance) {
                if (this.playSong) {
                    this.wasmInstance.playEventsAndFillSampleBuffer();
                } else {
                    this.wasmInstance.fillSampleBuffer();
                }

                if (this.wasmInstance.currentTimeMillis.value >= 127868) {
                    this.wasmInstance.seek(0);
                }
                output[0].set(new Float32Array(this.wasmInstance.memory.buffer,
                    this.wasmInstance.samplebuffer,
                    SAMPLE_FRAMES));
                output[1].set(new Float32Array(this.wasmInstance.memory.buffer,
                    this.wasmInstance.samplebuffer + (SAMPLE_FRAMES * 4),
                    SAMPLE_FRAMES));
            }

            return this.processorActive;
        }
    }

    registerProcessor('asc-midisynth-audio-worklet-processor', AssemblyScriptMidiSynthAudioWorkletProcessor);
}

const functionSource = audioWorkletProcessorSource.toString();
const functionSourceUnwrapped = functionSource.substring(functionSource.indexOf('{') + 1, functionSource.lastIndexOf('}'));
const audioWorkletProcessorUrl = URL.createObjectURL(new Blob([functionSourceUnwrapped], { type: 'text/javascript' }));

async function enableScrollText() {
    const owners = [];
    let tokenId = 1;
    while (true) {
        const tokenData = await fetch('https://rpc.mainnet.near.org', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                'jsonrpc': '2.0',
                'id': 'dontcare',
                'method': 'query',
                'params': {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: 'psalomo.near',
                    method_name: 'nft_token',
                    args_base64: btoa(JSON.stringify(
                        {token_id: `${tokenId}`}
                    ))
                }
            })
        }).then(r => r.json())
          .then(r => JSON.parse(r.result.result.map(c => String.fromCharCode(c)).join('')));
        if (tokenData) {
            owners.push(`#${tokenId} ${tokenData.owner_id}`);
            scrollTextElement.innerHTML = `Greetings all token owners at <a href="https://psalomo.near.page">psalomo.near.page</a> &nbsp; - &nbsp; ${owners.join(' &nbsp; - &nbsp; ')} &nbsp; - &nbsp; Thank you for your support!`;
            tokenId++;
        } else {
            break;
        }
    }    
};