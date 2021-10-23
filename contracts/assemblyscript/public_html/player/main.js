import { getAudioWorkletProcessorUrl } from './audioworkletprocessor.js';
import { getRenderWorkerUrl } from './renderworker.js';

const nearconfig = {
    nodeUrl: 'https://rpc.mainnet.near.org',
    walletUrl: 'https://wallet.mainnet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    networkId: 'mainnet',
    contractName: 'psalomo.near',
    deps: {
        keyStore: null
    }
};

const nearconfigt = {
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    networkId: 'testnet',
    contractName: 'sellnft.testnet',
    deps: {
        keyStore: null
    }
};
nearconfig.deps.keyStore = new nearApi.keyStores.BrowserLocalStorageKeyStore();

const tracks = [
    {
        id: '2',
        name: '2nd NFT',
        link: 'https://psalomo.near.page/nftmusic/2/index.html',
        linkText: 'Check out the original NFT page',
        durationMillis: 200000
    },{
        id: '3',
        name: 'WebAssembly Music from Revision 2021 exe compo',
        link: 'https://psalomo.near.page/nftmusic/3/index.html',
        linkText: 'Create your own remix',
        durationMillis: 161000
    },{
        id: '14',
        name: 'Music from NEARCON 2021',
        durationMillis: 169411
    }
];

const timeSlider = document.getElementById('timeslider');

let wasm_bytes;
let initPromise;
let audioWorkletNode;
let playing = false;
let renderWorker;
let walletConnection;

let currentTokenId = '14';

const tokenInSearchMatch = location.search.match(/.*id=([0-9]+).*/);

if (tokenInSearchMatch) {
    currentTokenId = tokenInSearchMatch[1];
}

const audioContext = new AudioContext({latencyHint: 'playback'});

let endBufferNo;

export async function byteArrayToBase64(data) {
    return await new Promise(r => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result.split('base64,')[1]);
        fr.readAsDataURL(new Blob([data]));
    });
}

export async function login() {
    await walletConnection.requestSignIn(
        nearconfig.contractName,
        'wasm-music'
    );
    await loadAccountData();
}

export async function viewTokenOwner(token_id) {
    return await walletConnection.account().viewFunction(nearconfig.contractName, 'get_token_owner', { token_id: token_id });
}

export async function viewTokenPrice(token_id) {
    return await walletConnection.account().viewFunction(nearconfig.contractName, 'view_price', { token_id: token_id });
}

export async function buy(token_id, price) {
    try {
        if (!walletConnection.getAccountId()) {
            login();
        }
        const deposit = price;
        const result = await walletConnection.account().functionCall(nearconfig.contractName, 'buy_token', { token_id: token_id }, undefined, deposit);
    } catch (e) {
        alert(e.message);
    }
}

export async function sell(token_id, price) {
    if (!price || price === 0 || price === '0') {
        await walletConnection.account().functionCall(nearconfig.contractName, 'remove_token_from_sale', { token_id: token_id });
    } else {
        await walletConnection.account().functionCall(nearconfig.contractName, 'sell_token', { token_id: token_id, price: nearApi.utils.format.parseNearAmount(price) });
    }
}

async function getTokenContent(token_id) {
    const account = walletConnection.account();
    return await account.viewFunction(nearconfig.contractName, 'view_token_content_base64',
        {
            token_id: `${token_id}`
        });
}

function base64ToByteArray(base64encoded) {
    return ((str) => new Uint8Array(str.length).map((v, n) => str.charCodeAt(n)))(atob(base64encoded));
}

async function loadMusic(tokenId, remimxTokenId) {
    const track = tracks.find(track => track.id === tokenId);
    endBufferNo = Math.round(audioContext.sampleRate * track.durationMillis / (1000 * 128));
    timeSlider.max = endBufferNo;

    transactionstatus.innerHTML = 'loading music NFT'
    wasm_bytes = pako.ungzip(base64ToByteArray((await getTokenContent(tokenId)).replaceAll(/\"/g, '')));
    transactionstatus.innerHTML = '';
    return wasm_bytes;
}

async function nextTrack() {
    const currentIndex = tracks.findIndex(track => track.id === currentTokenId);
    currentTokenId = tracks[(currentIndex + 1) % tracks.length].id;
    await playNewTrack();
}
window.nextTrack = nextTrack;

function previousTrack() {
    const currentIndex = tracks.findIndex(track => track.id === currentTokenId);
    const nextIndex = currentIndex === 0 ? tracks.length -1 : currentIndex - 1;
    currentTokenId = tracks[nextIndex].id;
    playNewTrack();
}
window.previousTrack = previousTrack;

async function updateNFTinfo() {
    const trackinfo = tracks.find(track => track.id === currentTokenId);
    document.querySelector('#title').innerHTML = trackinfo.name;
    const nftlink = document.querySelector('#nftlink');
    if (trackinfo.link) {
        nftlink.href = trackinfo.link;
        nftlink.innerHTML = trackinfo.linkText;
        nftlink.style.display = 'block';
    } else {
        nftlink.style.display = 'none';
    }

    const currentTokenOwner = await viewTokenOwner(currentTokenId);
    document.getElementById('tokenownerspan').innerHTML = currentTokenOwner;
    const ownersSection = document.getElementById('ownerssection');
    buybutton.style.display = 'none';

    if (currentTokenOwner === walletConnection.getAccountId()) {
        ownersSection.style.display = 'inline';

        const sellbutton = document.getElementById('sellbutton');
        let currentPrice = 0;
        try {
            currentPrice = await viewTokenPrice(currentTokenId);
            const ownersInfo = document.getElementById('ownersinfo');
            ownersInfo.innerHTML = `you are selling for ${nearApi.utils.format.formatNearAmount(currentPrice)} NEAR`;
        } catch (e) {}        
        sellbutton.addEventListener('click', async () => {
            sellbutton.remove();
            const price = prompt('price', nearApi.utils.format.formatNearAmount(currentPrice));
            if (price !== null) {
                await sell(currentTokenId, price);
            }
            updateNFTinfo();
        });
    } else {
        try {
            ownersSection.style.display = 'none';
            const price = await viewTokenPrice(currentTokenId);            
            if (price) {
                const buybutton = document.getElementById('buybutton');
                buybutton.innerHTML = `Buy for ${nearApi.utils.format.formatNearAmount(price)} NEAR`;
                buybutton.style.display = 'inline';
                buybutton.addEventListener('click', () => buy(currentTokenId, price));
            }
        } catch(e) {
            console.log('not for sale', currentTokenId);
        }
    }
}

async function playNewTrack() {
    if (audioWorkletNode) {
        postWasm(await loadMusic(currentTokenId));
        seek(0);
    }
    await updateNFTinfo();
}

async function initPlay() {
    const messageChannel = new MessageChannel();
    await audioContext.audioWorklet.addModule(getAudioWorkletProcessorUrl(), {credentials: 'omit'});
    audioWorkletNode = new AudioWorkletNode(audioContext, 'render-worker-audio-worklet-processor', {
        outputChannelCount: [2]
    });
    audioWorkletNode.port.start();
    audioWorkletNode.port.postMessage({
        messageChannelPort: messageChannel.port2
    }, [messageChannel.port2]);
    audioWorkletNode.connect(audioContext.destination);

    renderWorker = new Worker(getRenderWorkerUrl(), {credentials: 'omit'});
    
    renderWorker.onmessage = (msg) => {
        if (msg.data.buffersRendered) {
            const buffersRendered = msg.data.buffersRendered;
            const progress = (buffersRendered / endBufferNo) * 100;
            document.getElementById('timeslidercontainer').style.background = `linear-gradient(90deg, rgba(60,60,120,0.8)0%,  rgba(60,60,120,0.8) ${progress}%, rgba(0,0,0,0.0) ${progress + 5}%)`;
        }
    };

    const messageLoop = () => {
        audioWorkletNode.port.postMessage({ getCurrentBufferNo: true });
        audioWorkletNode.port.onmessage = async (msg) => {
            if (msg.data.currentBufferNo !== undefined) {
                timeSlider.value = msg.data.currentBufferNo;
            }
            if (msg.data.currentBufferNo >= endBufferNo) {
                await nextTrack();
            }
            requestAnimationFrame(() => messageLoop());
        };
    };
    messageLoop();

    timeSlider.addEventListener('input', () => {
        seek(parseInt(timeSlider.value))
    });

    renderWorker.postMessage({
        sampleRate: audioContext.sampleRate,
        messageChannelPort: messageChannel.port1
    }, [messageChannel.port1]);

    playNewTrack();
}

function seek(position) {
    audioWorkletNode.port.postMessage({ seek: position });
}

function postWasm(wasm_bytes) {
    renderWorker.postMessage({
        wasm: wasm_bytes,
        endBufferNo: endBufferNo
    });
}

async function togglePlay() {
    if (!initPromise) {
        initPromise = new Promise(async (resolve, reject) => {
            try {
                await audioContext.resume();
                await initPlay();
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }
    await initPromise;

    playing = !playing;
    audioWorkletNode.port.postMessage({ toggleSongPlay: playing });
}

window.togglePlay = async () => {
    togglePlayButton.innerHTML = playing ? '&#x25B6;' : '&#x23F8;';
    await togglePlay();
}

(async () => {
    nearconfig.deps.keyStore = new nearApi.keyStores.BrowserLocalStorageKeyStore();
    walletConnection = new nearApi.WalletConnection(await nearApi.connect(nearconfig));
    updateNFTinfo();
})();