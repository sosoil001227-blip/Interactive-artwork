import { boundary, distance, FACE_CORE, faceVisibility, materialToScreen, screenToCamera, smoothstep } from './geometry.ts'
import type { Face } from './geometry.ts'
import type { Hand } from './gestures.ts'
import { Rubber } from './rubber.ts'

const VERTEX=`
attribute vec2 a_position; attribute vec2 a_uv; attribute vec2 a_live_uv; attribute vec2 a_material; attribute float a_depth; attribute float a_side; attribute vec3 a_normal;
uniform vec2 u_size;
varying vec2 v_uv; varying vec2 v_live_uv; varying vec2 v_material; varying vec3 v_normal; varying float v_side;
void main(){gl_Position=vec4(a_position.x/u_size.x*2.0-1.0,1.0-a_position.y/u_size.y*2.0,-a_depth*.25,1.);v_uv=a_uv;v_live_uv=a_live_uv;v_material=a_material;v_normal=a_normal;v_side=a_side;}`
const FRAGMENT=`
precision highp float; uniform sampler2D u_video; uniform sampler2D u_live; uniform float u_twist; uniform float u_opacity; uniform float u_join; uniform vec3 u_skin; uniform vec4 u_cheeks; uniform vec2 u_patch;
varying vec2 v_uv; varying vec2 v_live_uv; varying vec2 v_material; varying vec3 v_normal; varying float v_side;
void main(){float radius=length(v_material);
float face=1.0-smoothstep(${(FACE_CORE-.009).toFixed(6)},${(FACE_CORE+.006).toFixed(6)},radius);
float guard=1.0-smoothstep(.98,1.0,radius);
float alpha=(v_side>0.?max(face,guard*u_join):face)*u_opacity;
if(alpha<.01)discard;
vec3 left=texture2D(u_video,clamp(u_cheeks.xy+v_material*u_patch,vec2(.001),vec2(.999))).rgb;
vec3 right=texture2D(u_video,clamp(u_cheeks.zw+v_material*u_patch,vec2(.001),vec2(.999))).rgb;
vec3 skin=mix(u_skin,mix(left,right,smoothstep(-.65,.65,v_material.x)),.72);
vec3 front=texture2D(u_video,clamp(v_uv,vec2(.001),vec2(.999))).rgb;
vec3 live=texture2D(u_live,clamp(v_live_uv,vec2(.001),vec2(.999))).rgb;
// All of the face retains its actual texture. Only the surrounding guard band
// transitions to fresh camera pixels, including while a hand occludes the face.
vec3 color=v_side>0.0?mix(front,live,smoothstep(.85,.995,radius)):skin;
vec3 normal=v_normal/max(length(v_normal),.0001);
normal*=normal.z<0.0?-1.0:1.0;
float amount=clamp(abs(u_twist)*.45,0.,1.0)*(1.0-smoothstep(.83,.98,radius));
vec3 light=normalize(vec3(-.45,-.65,1.));
float diffuse=max(0.,dot(normal,light));
float specular=pow(max(0.,dot(normal,normalize(light+vec3(0.,0.,1.)))),32.);
float shade=mix(1.,.76+diffuse*.29,amount);
vec3 lit=color*shade+vec3(1.,.88,.76)*specular*amount*.13;
gl_FragColor=vec4(lit*alpha,alpha);}`

export class Renderer {
  width=1;height=1
  markers=true
  private ctx:CanvasRenderingContext2D
  private hud:CanvasRenderingContext2D
  private gl:WebGLRenderingContext
  private program:WebGLProgram
  private position:WebGLBuffer
  private uvBuffer:WebGLBuffer
  private liveUVBuffer:WebGLBuffer
  private depthBuffer:WebGLBuffer
  private normalBuffer:WebGLBuffer
  private texture:WebGLTexture
  private liveTexture:WebGLTexture
  private uv:Float32Array
  private liveUV:Float32Array
  private liveFace:Face|undefined
  private liveTime=-1
  private textureFace:Face|undefined
  private sample=document.createElement('canvas')
  private sampleCtx:CanvasRenderingContext2D
  private skin=[178,136,111]
  private skinReady=false
  private lastSample=0
  private ratio=1
  private textureTime=-1
  private hasFrame=false
  private buffers:WebGLBuffer[]=[]
  constructor(private background:HTMLCanvasElement,private surface:HTMLCanvasElement,private overlay:HTMLCanvasElement,private rubber:Rubber){
    const ctx=background.getContext('2d',{alpha:false}),hud=overlay.getContext('2d'),gl=surface.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:false})
    if(!ctx||!hud||!gl)throw new Error('WebGL을 사용할 수 없어요. 브라우저의 그래픽 가속을 확인해 주세요.')
    this.ctx=ctx;this.hud=hud;this.gl=gl
    this.sample.width=this.sample.height=32
    this.sampleCtx=this.sample.getContext('2d',{willReadFrequently:true})!
    const shader=(type:number,source:string)=>{
      const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader)
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(`얼굴 셰이더 오류: ${log}`)}
      return shader
    }
    const vertex=shader(gl.VERTEX_SHADER,VERTEX),fragment=shader(gl.FRAGMENT_SHADER,FRAGMENT)
    const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program)
    gl.deleteShader(vertex);gl.deleteShader(fragment)
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('얼굴 표면을 준비하지 못했어요.')
    this.program=program;gl.useProgram(program)
    const attribute=(name:string,size:number,data:Float32Array,dynamic=false)=>{
      const buffer=gl.createBuffer()!;this.buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW)
      const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);return buffer
    }
    this.position=attribute('a_position',2,rubber.positions,true)
    this.uv=new Float32Array(rubber.material.length);this.uvBuffer=attribute('a_uv',2,this.uv,true)
    this.liveUV=new Float32Array(rubber.material.length);this.liveUVBuffer=attribute('a_live_uv',2,this.liveUV,true)
    attribute('a_material',2,rubber.material)
    this.depthBuffer=attribute('a_depth',1,rubber.depth,true)
    this.normalBuffer=attribute('a_normal',3,rubber.normals,true)
    attribute('a_side',1,rubber.sides)
    const index=gl.createBuffer()!;this.buffers.push(index);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,rubber.indices,gl.STATIC_DRAW)
    const texture=()=>{const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t}
    this.texture=texture();this.liveTexture=texture()
    gl.uniform1i(gl.getUniformLocation(program,'u_video'),0)
    gl.uniform1i(gl.getUniformLocation(program,'u_live'),1)
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL)
    this.resize()
  }
  resize(){
    const rect=this.background.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);this.ratio=Math.min(devicePixelRatio||1,1.75)
    for(const canvas of [this.background,this.surface,this.overlay]){canvas.width=Math.round(this.width*this.ratio);canvas.height=Math.round(this.height*this.ratio)}
    this.ctx.setTransform(this.ratio,0,0,this.ratio,0,0);this.hud.setTransform(this.ratio,0,0,this.ratio,0,0)
    this.gl.viewport(0,0,this.surface.width,this.surface.height);this.reset()
  }
  reset(){this.textureFace=this.liveFace=undefined;this.hasFrame=false;this.textureTime=this.liveTime=-1;this.skinReady=false;this.lastSample=0;this.clearSurface()}
  clearSurface(){this.gl.clearColor(0,0,0,0);this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT);this.hud.clearRect(0,0,this.width,this.height)}
  private facePath(ctx:CanvasRenderingContext2D,face:Face,scale:number){
    ctx.beginPath()
    for(let i=0;i<=144;i++){const p=boundary(face,i/144),x=face.center.x+(p.x-face.center.x)*scale,y=face.center.y+(p.y-face.center.y)*scale;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
    ctx.closePath()
  }
  private sampleSkin(video:HTMLVideoElement,face:Face,now:number,hands:Hand[]){
    if(now-this.lastSample<120)return
    this.lastSample=now
    const valid=face.cheeks.filter(p=>!hands.some(h=>h.points.some(f=>distance(f,p)<face.radius*.3)))
    if(!valid.length)return
    const colors:number[][]=[]
    for(const cheek of valid){
      const uv=screenToCamera(cheek,video.videoWidth,video.videoHeight,this.width,this.height),size=Math.max(4,video.videoWidth*.009)
      if(uv.x<0||uv.x>1||uv.y<0||uv.y>1)continue
      this.sampleCtx.drawImage(video,uv.x*video.videoWidth-size/2,uv.y*video.videoHeight-size/2,size,size,0,0,32,32)
      const pixels=this.sampleCtx.getImageData(0,0,32,32).data,color=[0,0,0]
      for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)color[c]!+=pixels[i+c]!/1024
      colors.push(color)
    }
    if(colors.length){
      for(let c=0;c<3;c++)this.skin[c]!+=(colors.reduce((sum,color)=>sum+color[c]!,0)/colors.length-this.skin[c]!)*(this.skinReady?.45:1)
      this.skinReady=true
    }
  }
  private updateTexture(video:HTMLVideoElement,face:Face,hands:Hand[]){
    // The face may be cached under an occluding hand. Its surrounding camera
    // pixels remain live through a separate texture, so the edge never freezes.
    const blocked=hands.some(h=>h.points.some(p=>distance(p,face.center)<face.radius*1.42))
    if(this.hasFrame&&blocked)return
    if(this.textureTime===video.currentTime)return
    this.gl.activeTexture(this.gl.TEXTURE0);this.gl.bindTexture(this.gl.TEXTURE_2D,this.texture)
    this.gl.texImage2D(this.gl.TEXTURE_2D,0,this.gl.RGBA,this.gl.RGBA,this.gl.UNSIGNED_BYTE,video)
    this.textureFace=face;this.textureTime=video.currentTime;this.hasFrame=true
    for(let i=0;i<this.rubber.material.length;i+=2){
      const p=materialToScreen({x:this.rubber.material[i]!,y:this.rubber.material[i+1]!},face)
      const uv=screenToCamera(p,video.videoWidth,video.videoHeight,this.width,this.height);this.uv[i]=uv.x;this.uv[i+1]=uv.y
    }
  }
  private updateLive(video:HTMLVideoElement,face:Face){
    const gl=this.gl
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.liveTexture)
    if(this.liveTime!==video.currentTime){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);this.liveTime=video.currentTime}
    if(this.liveFace===face)return
    this.liveFace=face
    for(let i=0;i<this.rubber.material.length;i+=2){
      const p=materialToScreen({x:this.rubber.material[i]!,y:this.rubber.material[i+1]!},face)
      const uv=screenToCamera(p,video.videoWidth,video.videoHeight,this.width,this.height);this.liveUV[i]=uv.x;this.liveUV[i+1]=uv.y
    }
  }
  draw(video:HTMLVideoElement|undefined,face:Face|undefined,hands:Hand[],now:number){
    const ctx=this.ctx,w=this.width,h=this.height
    this.clearSurface()
    if(!video||video.readyState<2){ctx.fillStyle='#e5e5dc';ctx.fillRect(0,0,w,h);return}
    const scale=Math.max(w/video.videoWidth,h/video.videoHeight)
    ctx.save();ctx.translate(w,0);ctx.scale(-1,1);ctx.drawImage(video,(w-video.videoWidth*scale)/2,(h-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale);ctx.restore()
    if(!face){if(this.markers)this.drawHands(hands);return}
    this.sampleSkin(video,face,now,hands)
    this.updateLive(video,face)
    this.updateTexture(video,face,hands)
    // Spring energy includes velocity: crossing the neutral position during a
    // bounce must not switch the matte and mesh off for a frame.
    const strain=Math.max(this.rubber.recovery/Math.max(1,face.radius)*22,this.rubber.torsion*12)
    const opacity=Math.min(1,strain)*faceVisibility(face,hands.length>0||this.rubber.settling,now)
    if(opacity<.001){if(this.markers)this.drawHands(hands);return}
    // No matte at rest and no enlarged, hard oval. Only the displaced original
    // face is covered; its outer transition fades smoothly into the live video.
    ctx.save();ctx.globalAlpha=opacity
    ctx.fillStyle=`rgb(${this.skin.map(v=>Math.round(v)).join(',')})`
    let previous=0
    for(let layer=1;layer<=24;layer++){
      const t=layer/24,alpha=opacity*t*t*(3-2*t)
      ctx.globalAlpha=(alpha-previous)/Math.max(.00001,1-previous)
      this.facePath(ctx,face,1.035-.145*t);ctx.fill();previous=alpha
    }
    ctx.restore()
    const source=this.textureFace
    if(!source)return
    const gl=this.gl
    for(const [buffer,data] of [[this.position,this.rubber.positions],[this.uvBuffer,this.uv],[this.liveUVBuffer,this.liveUV],[this.depthBuffer,this.rubber.depth],[this.normalBuffer,this.rubber.normals]] as const){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data)}
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture)
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.liveTexture)
    gl.uniform2f(gl.getUniformLocation(this.program,'u_size'),w,h);gl.uniform1f(gl.getUniformLocation(this.program,'u_twist'),Math.abs(this.rubber.twist))
    gl.uniform1f(gl.getUniformLocation(this.program,'u_opacity'),opacity)
    const join=(1-smoothstep(.05,.32,this.rubber.recovery/face.radius))*(1-smoothstep(.08,.6,this.rubber.torsion))
    gl.uniform1f(gl.getUniformLocation(this.program,'u_join'),join)
    gl.uniform3f(gl.getUniformLocation(this.program,'u_skin'),this.skin[0]!/255,this.skin[1]!/255,this.skin[2]!/255)
    const left=screenToCamera(source.cheeks[0],video.videoWidth,video.videoHeight,w,h),right=screenToCamera(source.cheeks[1],video.videoWidth,video.videoHeight,w,h)
    gl.uniform4f(gl.getUniformLocation(this.program,'u_cheeks'),left.x,left.y,right.x,right.y)
    gl.uniform2f(gl.getUniformLocation(this.program,'u_patch'),source.radius*.10/(video.videoWidth*scale),source.radius*.10/(video.videoHeight*scale))
    gl.drawElements(gl.TRIANGLES,this.rubber.indices.length,gl.UNSIGNED_SHORT,0)
    if(this.markers)this.drawHands(hands)
  }
  private drawHands(hands:Hand[]){
    const ctx=this.hud
    hands.forEach(hand=>{
      const held=this.rubber.grips.some(g=>g.active&&g.id===hand.id),p=hand.pinch
      ctx.fillStyle='#ffffffc0'
      for(const index of [4,8]){const tip=hand.points[index];if(!tip)continue;ctx.beginPath();ctx.arc(tip.x,tip.y,2.5,0,Math.PI*2);ctx.fill()}
      ctx.fillStyle=held?'#d6ff63':'#ffffffb0'
      ctx.beginPath();ctx.arc(p.x,p.y,held?5:hand.closed?3.5:2,0,Math.PI*2);ctx.fill()
    })
  }
  close(){for(const buffer of this.buffers)this.gl.deleteBuffer(buffer);this.gl.deleteTexture(this.texture);this.gl.deleteTexture(this.liveTexture);this.gl.deleteProgram(this.program)}
}
