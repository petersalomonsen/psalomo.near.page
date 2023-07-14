import { setupWebGL } from './webgl.js';
import wasmBytesBase64 from './much.wasm.base64.js';
import shadersource from './shadersource.js';
import { setProgressbarValue } from './progress-bar.js';

const wasmBytes = await fetch(wasmBytesBase64).then(r => r.arrayBuffer());

const sampleRate = 44100;

const durationFrames = sampleRate - (sampleRate % 128);
const durationMillis = durationFrames * 1000.0 / sampleRate;
const songLengthMillis = 188000;
const numBuffers = Math.floor(songLengthMillis / durationMillis);

let songStartTime;

let audioCtx;
let audioBufSrcNode;

const playbutton = document.getElementById('playbutton');

const worker = new Worker(new URL('renderworker.js', import.meta.url), { type: 'module' });

const buffers = [];

async function createBuffers(sendWasm = false) {
    const { leftbuffer, rightbuffer, activeVoicesStatusSnaphots } = await new Promise(async resolve => {
        worker.postMessage({
            wasm: sendWasm ? wasmBytes : undefined,
            samplerate: sampleRate,
            songduration: durationMillis
        });
        worker.onmessage = msg => {
            if (msg.data.leftbuffer) {
                resolve(msg.data);
            } else {
                //document.querySelector('#loaderprogress').innerHTML = (msg.data.progress * 100).toFixed(2) + '%';
            }
        }
    });
    buffers.push({ leftbuffer, rightbuffer, activeVoicesStatusSnaphots });
}

const result = await fetch('https://rpc.mainnet.near.org', {
    method: 'POST',
    headers: {
        'content-type': 'application/json'
    },
    body: JSON.stringify({
        "jsonrpc": "2.0",
        "id": "dontcare",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": "jsinrustnft.near",
            "method_name": "nft_token",
            "args_base64": btoa(JSON.stringify({ token_id: 'aliens_close' }))
        }
    })
}).then(r => r.json());
const nftdata = JSON.parse(result.result.result.map(c => String.fromCharCode(c)).join(''));

async function createWelcomeImage() {

    // Create the offscreen canvas element
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set canvas dimensions based on the text size
    canvas.width = 1152;
    canvas.height = 1280;

    // Set canvas size and drawing context
    context.font = "70px Arial";

    // Set text color and draw text onto the canvas
    context.fillStyle = '#fff';
    const owner_width = context.measureText(nftdata.owner_id).width;
    const id_width = context.measureText(nftdata.token_id).width;

    context.fillText(nftdata.owner_id, (canvas.width - owner_width) / 2, 400);
    context.fillText('proudly presents', 350, 500);
    context.fillText(nftdata.token_id, (canvas.width - id_width) / 2, 600);

    return canvas.toDataURL();
}

let chunkStartTime;

const startAudioBufSrcNode = async () => {
    for (let bufferNdx = 0; audioCtx && bufferNdx < numBuffers; bufferNdx++) {
        while (!buffers[bufferNdx]) {
            await new Promise(r => setTimeout(() => r(), 1));
        }
        const audioBuf = audioCtx.createBuffer(2, durationFrames, sampleRate);
        audioBuf.getChannelData(0).set(new Float32Array(buffers[bufferNdx].leftbuffer));
        audioBuf.getChannelData(1).set(new Float32Array(buffers[bufferNdx].rightbuffer));
        audioBufSrcNode = audioCtx.createBufferSource();
        audioBufSrcNode.buffer = audioBuf;

        audioBufSrcNode.connect(audioCtx.destination);
        audioBufSrcNode.loop = false;
        audioBufSrcNode.start(chunkStartTime);
        chunkStartTime += durationMillis / 1000.0;
    }
};

if (audioCtx && audioBufSrcNode) {
    audioBufSrcNode.stop();
    audioBufSrcNode.disconnect();
    audioBufSrcNode = null;
    startAudioBufSrcNode();
}

playbutton.onclick = async () => {
    try {
        playbutton.style.visibility = 'hidden';

        if (audioCtx) {
            audioCtx.close();
            audioCtx = null;
            return;
        }
        audioCtx = new AudioContext();

        let numConcurrent = 0;
        setProgressbarValue(0);

        let renderStartTime = new Date().getTime();

        const totalDurationMillis = durationMillis * numBuffers;
        let timeNotYetRendered = totalDurationMillis;
        let estimatedRenderTimeLeft = timeNotYetRendered * 2;
        let audiorendererror;
        (async () => {
            try {
                await createBuffers(true);
                timeNotYetRendered -= durationMillis;
                for (let n = 1; n < numBuffers; n++) {
                    await createBuffers();

                    estimatedRenderTimeLeft = ((numBuffers - n) * (new Date().getTime() - renderStartTime) / n);
                    timeNotYetRendered = durationMillis * (numBuffers - n);
                }
                estimatedRenderTimeLeft = 0;
                timeNotYetRendered = 0;
            } catch (e) {
                audiorendererror = e;
            }
        })();

        while (!audiorendererror && estimatedRenderTimeLeft > timeNotYetRendered) {
            setProgressbarValue((totalDurationMillis - timeNotYetRendered) / totalDurationMillis, 'rendering audio');
            await new Promise(r => setTimeout(() => r(), 1));
        }

        if (audiorendererror) {
            throw audiorendererror;
        }
        setProgressbarValue(null);

        try {
            // await document.documentElement.requestFullscreen();
        } catch (e) {
            console.error('full screen not possible');
        }
        const getCurrentTime = () => (songStartTime && audioCtx?.currentTime - songStartTime) ?? 0;
        setupWebGL(shadersource, document.getElementById('videocanvas'), () => audioCtx?.currentTime - songStartTime ?? 0, () => {
            const currentTimeMillis = getCurrentTime() * 1000;
            const bufferpos = Math.floor(currentTimeMillis / durationMillis);
            const targetNoteStates = new Array(128).fill(-1);
            if (bufferpos >= 0) {
                const voiceStatusArrLength = 32 * 3;
                const snapshotBufferPos = voiceStatusArrLength * Math.floor((durationFrames * (currentTimeMillis % durationMillis) / durationMillis) / 128);

                const voiceStatusArr = new Uint8Array(buffers[bufferpos].activeVoicesStatusSnaphots, snapshotBufferPos, voiceStatusArrLength);

                for (let n = 0; n < voiceStatusArr.length; n += 3) {
                    targetNoteStates[voiceStatusArr[n + 1]] = ((voiceStatusArr[n + 2] / 127) * 2 - 1);
                }
            }
            return targetNoteStates;
        });

        const bufferingtime = 0.2;
        chunkStartTime = audioCtx.currentTime + bufferingtime;
        songStartTime = chunkStartTime;
        startAudioBufSrcNode();
    } catch (e) {
        setProgressbarValue(null);
        document.body.innerHTML = e;
    }
};

