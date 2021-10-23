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

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    self.clients.claim();
});

self.addEventListener('fetch', (event) =>
    event.respondWith(new Promise(async resolve => {
        if (event.request.url.indexOf(self.registration.scope) === 0) {
            const path = event.request.url.split('?')[0].substring(self.registration.scope.length);

            resolve(fetch('https://rpc.mainnet.near.org', {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "jsonrpc": "2.0",
                    "id": "dontcare",
                    "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": "psalomo.near",
                        "method_name": "web4_get",
                        "args_base64": btoa(JSON.stringify({
                            request: {
                                path: '/' + path
                            }
                        }))
                    }
                })
            }).then(async response => {
                const result = (await response.json()).result.result;
                const resultObj = JSON.parse(String.fromCharCode.apply(null, result));

                return new Response(
                    new Blob([atob(resultObj.body)], { type: resultObj.contentType }), {
                    status: 200
                });
            }));
        } else {
            resolve(fetch(event.request));
        }
    }))
);
