import { build } from 'vite'
import { fileURLToPath } from 'node:url'
await build({configFile:false,publicDir:false,logLevel:'warn',build:{
  target:['chrome79','edge79','firefox78','safari14'],emptyOutDir:true,
  outDir:fileURLToPath(new URL('../src/assets/face-runtime/',import.meta.url)),
  lib:{entry:fileURLToPath(new URL('../src/face-worker.ts',import.meta.url)),name:'RubberFaceWorker',formats:['iife'],fileName:()=> 'face-worker.js'},minify:true,
}})
