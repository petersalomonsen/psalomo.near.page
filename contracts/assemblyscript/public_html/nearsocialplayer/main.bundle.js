import 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.0.3/pako.min.js';

const tokenId = '2';

async function getData(method_name, token_id) {
    return await fetch('https://rpc.mainnet.near.org', {
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
                method_name: method_name,
                args_base64: btoa(JSON.stringify(
                    { token_id: `${tokenId}` }
                ))
            }
        })
    }).then(r => r.json()).then(r => JSON.parse(r.result.result.map(c => String.fromCharCode(c)).join('')));
}

async function getWasmBytesFromGzippedBase64(gzippedBase64) {
    function _base64ToArrayBuffer(base64) {
        var binary_string = window.atob(base64);
        var len = binary_string.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
    return pako.ungzip(_base64ToArrayBuffer((gzippedBase64).replaceAll(/\"/g, '')));
}

function toggleSpinner(state) {
    if (state) {
        document.getElementById('loadercontainer').style.display = 'flex';
    } else {
        document.getElementById('loadercontainer').style.display = 'none';
    }
}

const token_data = await getData('nft_token');
document.getElementById('ownerspan').innerHTML = token_data.owner_id;

const gzippedBase64 = await getData('view_token_content_base64');
const wasmBytes = await getWasmBytesFromGzippedBase64(gzippedBase64);

globalThis.onmessage = async (msg) => {
    
    const messageOrigin = msg.origin;
    console.log(messageOrigin);

    const worker = new Worker(URL.createObjectURL(new Blob([
                            (() => {
                                function jsFunc() {onmessage = async (msg) => {
    if (msg.data.wasm) {
        const sampleRate = msg.data.samplerate;
        const wasmInstancePromise = WebAssembly.instantiate(msg.data.wasm,
            {
                environment: {
                    SAMPLERATE: sampleRate
                }
            });
        const wasmInstance = (await wasmInstancePromise).instance.exports;
        const patternschedule = msg.data.patternschedule;
        if (patternschedule) {
            for (let n = 0; n < patternschedule.length; n++) {
                wasmInstance.setMidiPartSchedule(n, patternschedule[n].patternindex, patternschedule[n].starttime);
            }
        }
        const duration = msg.data.songduration;
        const SAMPLE_FRAMES = 128;
        const leftbuffer = new Float32Array(wasmInstance.memory.buffer,
            wasmInstance.samplebuffer,
            SAMPLE_FRAMES);
        const rightbuffer = new Float32Array(wasmInstance.memory.buffer,
            wasmInstance.samplebuffer + (SAMPLE_FRAMES * 4),
            SAMPLE_FRAMES);

        const numbuffers = 100;
        const bitDepth = 32;
        const numChannels = 2;

        var bytesPerSample = bitDepth / 8;
        var blockAlign = numChannels * bytesPerSample;

        const chunklength = numChannels * bytesPerSample * (duration * 0.001 * sampleRate + numbuffers * SAMPLE_FRAMES);

        var buffer = new ArrayBuffer(44 + chunklength);
        var view = new DataView(buffer);
        function writeString(view, offset, string) {
            for (var i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }
        /* RIFF identifier */
        writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + chunklength, true);
        /* RIFF type */
        writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 3, true);
        /* channel count */
        view.setUint16(22, numChannels, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * blockAlign, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, blockAlign, true);
        /* bits per sample */
        view.setUint16(34, bitDepth, true);
        /* data chunk identifier */
        writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, chunklength, true);

        let offset = 44;
        while (wasmInstance.currentTimeMillis.value < duration) {
            for (let b = 0; b < numbuffers; b++) {
                wasmInstance.playEventsAndFillSampleBuffer();
                for (let n = 0; n < SAMPLE_FRAMES; n++) {
                    view.setFloat32(offset, leftbuffer[n], true);
                    offset += 4;
                    view.setFloat32(offset, rightbuffer[n], true);
                    offset += 4;
                }
            }
            postMessage({
                exportWavPosition: wasmInstance.currentTimeMillis.value,
                progress: wasmInstance.currentTimeMillis.value / duration
            });
            await new Promise(r => setTimeout(r, 0));
        }
        postMessage({ musicdata: buffer }, [buffer]);
    }
};}
                                const jsFuncSource = jsFunc.toString();
                                return jsFuncSource.substring( jsFuncSource.indexOf('{') + 1,  jsFuncSource.lastIndexOf('}'));
                            })()
                        ], { type: 'text/javascript' })));
    toggleSpinner(true);
    const musicdata = await new Promise(async resolve => {
        worker.postMessage({
            wasm: wasmBytes, samplerate: 44100,
            songduration: 20000
        });
        worker.onmessage = msg => {
            if (msg.data.musicdata) {
                resolve(msg.data.musicdata);
            } else {
                document.querySelector('#loaderprogress').innerHTML = (msg.data.progress * 100).toFixed(2) + '%';
            }
        };
    });
    toggleSpinner(false);

    globalThis.parent.postMessage({ musicdata }, messageOrigin, [musicdata]);
};
