const SAMPLE_FRAMES = 128;

let wasmInstance;
let wasmleftbuffer;
let wasmrightbuffer;
let durationFrames;

onmessage = async (msg) => {
    if (msg.data.wasm) {
        const sampleRate = msg.data.samplerate;
        const wasmInstancePromise = WebAssembly.instantiate(msg.data.wasm,
            {
                environment: {
                    SAMPLERATE: sampleRate
                }
            });
        wasmInstance = (await wasmInstancePromise).instance.exports;

        const durationMillis = msg.data.songduration;

        durationFrames = durationMillis * sampleRate / 1000;

        const samplebuffer = wasmInstance.allocateSampleBuffer ? wasmInstance.allocateSampleBuffer(SAMPLE_FRAMES) : wasmInstance.samplebuffer;
        wasmleftbuffer = new Float32Array(wasmInstance.memory.buffer,
            samplebuffer,
            SAMPLE_FRAMES);
        wasmrightbuffer = new Float32Array(wasmInstance.memory.buffer,
            samplebuffer + (SAMPLE_FRAMES * 4),
            SAMPLE_FRAMES);
    }

    const leftbuffer = new ArrayBuffer(durationFrames * 4);
    const leftview = new DataView(leftbuffer);
    const rightbuffer = new ArrayBuffer(durationFrames * 4);
    const rightview = new DataView(rightbuffer);

    const activeVoicesStatusSnaphots = new ArrayBuffer(32 * 3 * durationFrames / SAMPLE_FRAMES);
    const activeVoicesStatusSnaphotsArr = new Uint8Array(activeVoicesStatusSnaphots);
    const isLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
    let framepos = 0;

    while (framepos < durationFrames) {
        wasmInstance.playEventsAndFillSampleBuffer != undefined ?
            wasmInstance.playEventsAndFillSampleBuffer() :
            wasmInstance.fillSampleBuffer();

        const activeVoicesStatusSnapshot = new Uint8Array(wasmInstance.memory.buffer,
            wasmInstance.getActiveVoicesStatusSnapshot(),
            32 * 3).slice(0);

        activeVoicesStatusSnaphotsArr.set(activeVoicesStatusSnapshot, framepos * 32 * 3 / SAMPLE_FRAMES);

        for (let n = 0; n < SAMPLE_FRAMES && framepos < durationFrames; n++) {
            leftview.setFloat32(framepos * 4, wasmleftbuffer[n], isLittleEndian);
            rightview.setFloat32(framepos * 4, wasmrightbuffer[n], isLittleEndian);
            framepos++;
        }
    }
    postMessage({ leftbuffer, rightbuffer, activeVoicesStatusSnaphots }, [leftbuffer, rightbuffer, activeVoicesStatusSnaphots]);
};
