import html from '@web/rollup-plugin-html';
import { terser } from 'rollup-plugin-terser';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';


export default {
    input: 'main.js',
    output: { file: 'main.bundle.js', format: 'esm' },
    plugins: [        
        (() => ({
            transform(code, id) {
                const urlMatch = code.match(/(new URL\([^),]+\,\s*import.meta.url\s*\))/);
                if (urlMatch) {
                    const urlWithAbsolutePath = urlMatch[1].replace('import.meta.url', `'file://${id}'`);

                    const func = new Function('return ' + urlWithAbsolutePath);
                    const resolvedUrl = func();
                    const pathname = resolvedUrl.pathname;

                    if (pathname.endsWith('.js')) {
                        code = code.replace(urlMatch[0], `URL.createObjectURL(new Blob([
                            (() => {
                                function jsFunc() {${readFileSync(pathname).toString()}}
                                const jsFuncSource = jsFunc.toString();
                                return jsFuncSource.substring( jsFuncSource.indexOf('{') + 1,  jsFuncSource.lastIndexOf('}'));
                            })()
                        ], { type: 'text/javascript' }))`);
                    }
                }
                return {
                    code: code
                }
            }
        }))(),
        //terser(),
        {
            name: 'inline-js',
            closeBundle: () => {
                const js = readFileSync('main.bundle.js').toString();
                const html = readFileSync('index.html').toString()
                    .replace(`<script type="module" src="main.js"></script>`,
                        `<script type="module">${js}</script>`);
                writeFileSync('index_bundle.html', html);

                const dataUri = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
                writeFileSync(`nearbos.jsx`, `
State.init({musicdata: null, musicrequest: null});
function playAudio() {
    State.update({musicrequest: true}); 
}

function musicReceived(musicdata) {
    const blob = new Blob([musicdata], {
        type: "audio/wav"
    });
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.src = url;
    audio.play();
}

const iframe = <iframe message={state.musicrequest} onMessage={(msg) => musicReceived(msg.musicdata)} style={{ width: "500px", height: "230px" }} src="${dataUri}"></iframe>;

return <>
<button onClick={() => playAudio()}>Play</button>
{ iframe }
</>
`)
            }
        }
    ]
};
