// GPU effects and composited recording. No external runtime, safe fallback on iOS.
const VERTEX = `attribute vec2 position;
varying vec2 uv;
void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
const FRAGMENT = `precision mediump float;
varying vec2 uv;
uniform sampler2D image;
uniform int effect;
uniform float time;
uniform vec2 resolution;
uniform float softSkin;
void main(){
  vec4 pixel=texture2D(image,vec2(uv.x,1.0-uv.y));
  vec3 c=pixel.rgb;
  if(softSkin>0.001){
    vec3 rgb=c;
    float mx=max(max(rgb.r,rgb.g),rgb.b);
    float mn=min(min(rgb.r,rgb.g),rgb.b);
    float chroma=mx-mn;
    float skin=step(0.24,rgb.r)*step(0.15,rgb.g)*step(0.08,rgb.b)
      *step(rgb.g,rgb.r)*step(rgb.b,rgb.g)*smoothstep(0.04,0.16,chroma);
    vec2 d=1.8/resolution;
    vec3 sum=vec3(0.0);
    float weight=0.0;
    for(int x=-2;x<=2;x++){
      for(int y=-2;y<=2;y++){
        vec2 offset=vec2(float(x),float(y))*d;
        vec3 neighbor=texture2D(image,vec2(uv.x,1.0-uv.y)+offset).rgb;
        vec3 diff=neighbor-rgb;
        float spatial=exp(-dot(vec2(float(x),float(y)),vec2(float(x),float(y)))*0.28);
        float tonal=exp(-dot(diff,diff)*48.0);
        float w=spatial*tonal;
        sum+=neighbor*w;weight+=w;
      }
    }
    vec3 blurred=sum/max(weight,0.001);
    float edge=1.0-smoothstep(0.08,0.35,length(blurred-rgb));
    c=mix(rgb,blurred,softSkin*skin*edge*0.88);
  }
  float l=dot(c,vec3(0.299,0.587,0.114));
  if(effect==1){c=mix(c,vec3(l),0.15);c*=vec3(1.15,1.04,0.88);c=pow(c,vec3(0.94));}
  if(effect==2){c=mix(c,vec3(l),0.17);c=pow(c,vec3(0.85));c=mix(c,vec3(1.0),0.08);}
  if(effect==3){c=vec3(l);c=(c-0.5)*1.16+0.5;}
  if(effect==4){c=mix(c,vec3(l),0.45);c*=vec3(1.17,1.05,0.79);}
  if(effect==5){c=(c-0.5)*1.28+0.5;c=mix(c,vec3(l),0.17);}
  float vignette=smoothstep(0.9,0.28,length((uv-0.5)*vec2(0.9,1.0)));
  if(effect==4||effect==5)c*=mix(0.82,1.0,vignette);
  gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
}`;
const EFFECTS = ['natural','golden','dreamy','mono','vintage','cinema'];
function compile(gl,type,source){
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
export function createVideoPipeline({video,canvas,aspectRatio='9:16',onError}){
  const [rw,rh]=aspectRatio.split(':').map(Number);
  const height=720;
  const width=Math.round(height*rw/rh/2)*2;
  canvas.width=width;canvas.height=height;
  const stage=document.createElement('canvas');
  stage.width=width;stage.height=height;
  const crop=document.createElement('canvas');
  crop.width=width;crop.height=height;
  const cropCtx=crop.getContext('2d',{alpha:false});
  let gl,program,texture,position,effect,softUniform,frame=0;
  try{
    gl=stage.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false});
    if(!gl)throw new Error('WebGL indisponível');
    program=gl.createProgram();
    gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,VERTEX));
    gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,FRAGMENT));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Shader não compilou');
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    position=gl.getAttribLocation(program,'position');
    gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    effect=gl.getUniformLocation(program,'effect');
    softUniform=gl.getUniformLocation(program,'softSkin');
    gl.uniform2f(gl.getUniformLocation(program,'resolution'),width,height);
    texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.viewport(0,0,width,height);
  }catch(error){gl=null;onError?.('GPU indisponível, usando Canvas 2D: '+error.message);}
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas 2D indisponível');
  let running=true,filterId='natural',sticker='none',mirror=true,softSkin=0;
  const cover=(source,target)=>{
    const vw=video.videoWidth,vh=video.videoHeight;
    if(!vw||!vh)return;
    const sourceRatio=vw/vh;
    const targetRatio=width/height;
    // iOS may return a landscape camera track despite portrait constraints.
    // Cropping that track to 9:16 cuts away most of the face: use contain instead.
    const needsContain=sourceRatio>targetRatio*1.12 || sourceRatio<targetRatio/1.12;
    target.save();
    target.clearRect(0,0,width,height);
    if(needsContain){
      // Single camera image, letterboxed inside the 9:16 Story frame.
      // Never paint a second, enlarged copy of the face behind it.
      target.fillStyle='#111';
      target.fillRect(0,0,width,height);
      const fitScale=Math.min(width/vw,height/vh);
      const fw=vw*fitScale,fh=vh*fitScale;
      target.drawImage(source,(width-fw)/2,(height-fh)/2,fw,fh);
    }else{
      const scale=Math.max(width/vw,height/vh);
      const sw=width/scale,sh=height/scale;
      target.drawImage(source,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,width,height);
    }
    target.restore();
  };
  const frameDraw=()=>{
    if(!running)return;
    try{
      if(video.readyState>=2&&video.videoWidth){
        if(gl){
          // Crop camera to exact output ratio before shader processing.
          cover(video,cropCtx);
          gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,crop);
          gl.uniform1i(effect,Math.max(0,EFFECTS.indexOf(filterId)));
          gl.uniform1f(softUniform,softSkin);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        }
        ctx.save();
        if(mirror){ctx.translate(width,0);ctx.scale(-1,1);}
        if(gl)ctx.drawImage(stage,0,0,width,height);
        else{
          ctx.filter={
            natural:'none',golden:'sepia(.3) saturate(1.3)',dreamy:'brightness(1.12)',
            mono:'grayscale(1)',vintage:'sepia(.65)',cinema:'contrast(1.25)'
          }[filterId]||'none';
          cover(video,ctx);ctx.filter='none';
        }
        ctx.restore();
        if(sticker!=='none'){
          ctx.font=`${Math.round(width*0.17)}px system-ui`;
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=12;
          ctx.fillText(sticker,width*0.5,height*0.17);
          ctx.shadowBlur=0;
        }
      }
    }catch(error){onError?.('Erro ao renderizar efeito: '+error.message);running=false;return;}
    frame=requestAnimationFrame(frameDraw);
  };
  frame=requestAnimationFrame(frameDraw);
  return {
    canvas,width,height,
    setFilter(value){filterId=value;},
    setSoftSkin(value){softSkin=Math.max(0,Math.min(1,Number(value)||0));},
    setSticker(value){sticker=value;},
    setMirror(value){mirror=Boolean(value);},
    captureStream(fps=24){return canvas.captureStream?.(fps)||null;},
    stop(){running=false;cancelAnimationFrame(frame);if(gl){gl.deleteTexture(texture);gl.deleteProgram(program);}}
  };
}
