import {describe,it,expect,afterEach,vi} from 'vitest';
import {softwareRendering,resetSoftwareRenderingProbe} from '../src/health/components/exercise/softwareRendering.js';

function stubRenderer(name,{debugInfo=true,context=true}={}){
 const lose=vi.fn();
 const gl={RENDERER:1,getExtension:n=>n==='WEBGL_debug_renderer_info'?(debugInfo?{UNMASKED_RENDERER_WEBGL:2}:null):n==='WEBGL_lose_context'?{loseContext:lose}:null,getParameter:key=>key===2||!debugInfo?name:'WebKit WebGL'};
 vi.spyOn(document,'createElement').mockImplementation(()=>({getContext:()=>context?gl:null}));
 return lose;
}
afterEach(()=>{vi.restoreAllMocks();resetSoftwareRenderingProbe(undefined);});

describe('software rendering probe',()=>{
 it('recognises renderers with no GPU behind them and releases the probe context',()=>{
  for(const name of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)','llvmpipe (LLVM 15.0.7, 256 bits)','Microsoft Basic Render Driver']){
   resetSoftwareRenderingProbe(undefined);const lose=stubRenderer(name);
   expect(softwareRendering(),name).toBe(true);expect(lose).toHaveBeenCalled();vi.restoreAllMocks();
  }
 });
 it('keeps full quality on real GPUs, when the name is hidden, and when WebGL is missing',()=>{
  for(const [name,options] of [['ANGLE (Apple, Apple M2, OpenGL 4.1)',{}],['Adreno (TM) 740',{}],['Mali-G78',{debugInfo:false}],['',{context:false}]]){
   resetSoftwareRenderingProbe(undefined);stubRenderer(name,options);
   expect(softwareRendering(),name).toBe(false);vi.restoreAllMocks();
  }
 });
 it('probes once and reuses the answer',()=>{
  stubRenderer('llvmpipe');expect(softwareRendering()).toBe(true);
  vi.restoreAllMocks();stubRenderer('Adreno (TM) 740');
  expect(softwareRendering()).toBe(true);
 });
});
