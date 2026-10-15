import { APP_VERSION } from "@/lib/version";
export interface AITrace {
 appVersion?:string;
 id:string; startedAt:number; request?:unknown; status:"pending"|"success"|"error";
 raw?:string; elapsedMs?:number; metrics?:Record<string,unknown>; error?:string;
}
let traces:AITrace[]=[];
const listeners=new Set<()=>void>();
export const traceSnapshot=()=>traces;
const empty:AITrace[]=[];
export const emptyTraces=()=>empty;
export function subscribeTrace(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};}
export function setTrace(t:AITrace){traces=[{...t,appVersion:APP_VERSION},...traces.filter(x=>x.id!==t.id)].slice(0,10);listeners.forEach(fn=>fn());}
export function clearTraces(){traces=[];listeners.forEach(fn=>fn());}
