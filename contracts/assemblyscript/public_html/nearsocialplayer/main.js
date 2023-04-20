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

const token_data = await getData('nft_token', tokenId);
document.getElementById('ownerspan').innerHTML = token_data.owner_id;

const gzippedBase64 = await getData('view_token_content_base64', tokenId);
const wasmBytes = await getWasmBytesFromGzippedBase64(gzippedBase64);

const worker = new Worker(new URL('renderworker.js', import.meta.url));
toggleSpinner(true);
const musicdata = await new Promise(async resolve => {
    worker.postMessage({
        wasm: wasmBytes, samplerate: 44100,
        songduration: 10000
    });
    worker.onmessage = msg => {
        if (msg.data.musicdata) {
            resolve(msg.data.musicdata);
        } else {
            document.querySelector('#loaderprogress').innerHTML = (msg.data.progress * 100).toFixed(2) + '%';
        }
    }
});
toggleSpinner(false);

const dataurl = await new Promise(r => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(new Blob([musicdata],{type: 'audio/wav'}));
});
const playerElement = document.getElementById('player');
const sourceElement = document.createElement('source');
sourceElement.src = dataurl;
sourceElement.type = 'audio/wav';
playerElement.appendChild(sourceElement);
