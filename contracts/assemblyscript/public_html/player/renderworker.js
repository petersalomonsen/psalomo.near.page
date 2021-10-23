function renderWorker() {
    const SAMPLE_FRAMES = 128;

    let messageChannelPort;
    let sampleRate;
    let wasmNo = 0;

    self.onmessage = async (msg) => {
        if (msg.data.messageChannelPort) {
            messageChannelPort = msg.data.messageChannelPort
        }
        if (msg.data.sampleRate) {
            sampleRate = msg.data.sampleRate;
        }
        if (msg.data.wasm) {
            wasmNo++;
            const currentWasmNo = wasmNo;
            const wasmInstance = (await WebAssembly.instantiate(msg.data.wasm,
                {
                    environment: {
                        SAMPLERATE: sampleRate
                    }
                })).instance.exports;

            const leftbuffer = new Float32Array(wasmInstance.memory.buffer,
                wasmInstance.samplebuffer,
                SAMPLE_FRAMES);
            const rightbuffer = new Float32Array(wasmInstance.memory.buffer,
                wasmInstance.samplebuffer + (SAMPLE_FRAMES * 4),
                SAMPLE_FRAMES);
            const transferLeft = new Float32Array(leftbuffer.length);
            const transferRight = new Float32Array(rightbuffer.length);

            const endBufferNo = msg.data.endBufferNo;

            let lastProgressReportTime = Date.now();

            messageChannelPort.postMessage({
                endBufferNo: endBufferNo
            });
            for (let bufferNo = 0; bufferNo < endBufferNo && currentWasmNo === wasmNo; bufferNo++) {
                wasmInstance.playEventsAndFillSampleBuffer();

                transferLeft.set(leftbuffer);
                transferRight.set(rightbuffer);

                messageChannelPort.postMessage({
                    bufferNo: bufferNo,
                    left: transferLeft.buffer,
                    right: transferRight.buffer
                });

                if (Date.now() - lastProgressReportTime > 100) {
                    lastProgressReportTime = Date.now();
                    self.postMessage({
                        buffersRendered: bufferNo
                    });
                    await new Promise(r => setTimeout(r, 0));
                }
            }
            if (currentWasmNo === wasmNo) {
                self.postMessage({
                    buffersRendered: endBufferNo
                });
            }
        }
    };
}

export function getRenderWorkerUrl() {
    const functionSource = renderWorker.toString();
    const functionSourceUnwrapped = functionSource.substring(functionSource.indexOf('{') + 1, functionSource.lastIndexOf('}'));
    return URL.createObjectURL(new Blob([functionSourceUnwrapped], { type: 'text/javascript' }));
}
