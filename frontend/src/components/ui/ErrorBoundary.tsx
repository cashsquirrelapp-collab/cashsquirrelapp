import { Component,type ReactNode } from 'react';
import { hideSplash } from '../../app/splash';
import { isChunkLoadError, reloadWhenSafe } from '../../app/appUpdate';
import { tr } from '../../i18n/tr';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean;updating:boolean}> {
 state={failed:false,updating:false};
 static getDerivedStateFromError(){return {failed:true};}
 // Old code asked for after a deploy: open the new build instead of showing an error (owner, 2026-10-22).
 // Only when that does not help (it reloaded moments ago) does the message below appear.
 componentDidCatch(error:unknown){
  if(isChunkLoadError(error)&&reloadWhenSafe()){this.setState({updating:true});return;}
  // The opening logo must never hide this message.
  hideSplash();
 }
 render(){
  if(this.state.failed&&this.state.updating)return <div role="status" className="min-h-screen flex items-center justify-center bg-brand-bg p-8 text-center text-sm text-brand-muted">{tr("กำลังเปิดเวอร์ชันใหม่…")}</div>;
  if(this.state.failed)return <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-50 p-8 text-center text-stone-700"><h1 className="text-xl font-bold">{tr("โหลดหน้านี้ไม่สำเร็จ")}</h1><p>{tr("กรุณาลองโหลดหน้าใหม่อีกครั้ง")}</p><button type="button" className="rounded-xl bg-[#E65F2B] px-5 py-3 font-bold text-white" onClick={()=>window.location.reload()}>{tr("โหลดหน้าใหม่")}</button></div>;
  return this.props.children;
 }
}
