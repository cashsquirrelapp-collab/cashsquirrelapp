import { Component,type ReactNode } from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(this.state.failed)return <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-50 p-8 text-center text-stone-700"><h1 className="text-xl font-bold">โหลดหน้านี้ไม่สำเร็จ</h1><p>กรุณาลองโหลดหน้าใหม่อีกครั้ง</p><button type="button" className="rounded-xl bg-[#E65F2B] px-5 py-3 font-bold text-white" onClick={()=>window.location.reload()}>โหลดหน้าใหม่</button></div>;
  return this.props.children;
 }
}
