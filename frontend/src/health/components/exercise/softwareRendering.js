// True when WebGL has no GPU behind it (SwiftShader, llvmpipe and similar). There a single
// full-quality frame with shadow maps, blurred contact shadows and 2x resolution takes seconds
// and blocks the main thread: record saving and every tap wait for it.
let cached;
export function softwareRendering(){
 if(cached!==undefined)return cached;
 cached=false;
 try{
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  if(gl){
   const info=gl.getExtension('WEBGL_debug_renderer_info');
   const renderer=String(gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||'');
   cached=/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
   gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
 }catch{cached=false;}
 return cached;
}
// Tests only.
export function resetSoftwareRenderingProbe(value){cached=value;}
