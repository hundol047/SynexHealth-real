import {defineConfig,loadEnv} from 'vite';
import {validateRelease} from './scripts/release-config.mjs';
// Personal build: nothing leaves the device and only bundled code runs. WebAssembly is the
// bundled pose model; blob:/data: are local recordings, workers and embedded textures.
const PERSONAL_CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
export default defineConfig(({mode})=>{
 const e={...loadEnv(mode,process.cwd(),''),...process.env};const errors=validateRelease(e);if(errors.length)throw Error(errors.join('\n'));
 return {server:{port:5173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8000',changeOrigin:true}}},build:{outDir:'dist'},plugins:[{
  name:'personal-network-boundary',
  transformIndexHtml(){if(e.VITE_LOCAL_ONLY==='true')return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:PERSONAL_CSP},injectTo:'head-prepend'}];},
 },{name:'release-marker',generateBundle(){this.emitFile({type:'asset',fileName:'release-config.json',source:JSON.stringify({localOnly:e.VITE_LOCAL_ONLY==='true',release:e.VITE_RELEASE_BUILD==='true',api:e.VITE_API_BASE||'',mode:e.VITE_LAUNCH_MODE||'development',bundle:e.IOS_BUNDLE_ID||null})});}}]};
});
