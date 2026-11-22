import React from 'react';
import { CheckCircle2, Eraser, Maximize2, X } from 'lucide-react';
import type { QuoteApproval, QuoteView } from '../../../../shared/quoteApproval';
import { apiJson } from '../../services/api';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { A4_WIDTH_PX, DocumentPreview } from './DocumentA4';
import { calculateDocumentTotals, formatMoney } from './documentMath';
import { tr } from '../../i18n/tr';
import './quoteApproval.css';

// /q/<link>: the client's page for a quotation (owner, 2026-11-22). No account, no app: the quotation as printed, a
// name, a drawn signature, one tick and one button. Once confirmed it says so, with who and when.

const thaiDateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const drawn = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d')!;
    context.scale(ratio, ratio);
    context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = 2.4; context.strokeStyle = '#1F1B18';
  }, []);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true; last.current = point(event);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const context = event.currentTarget.getContext('2d')!;
    const next = point(event);
    context.beginPath(); context.moveTo(last.current.x, last.current.y); context.lineTo(next.x, next.y); context.stroke();
    last.current = next; drawn.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    if (drawn.current) onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    drawn.current = false; onChange(null);
  };
  return (
    <div className="qa-pad">
      <canvas ref={canvasRef} aria-label={tr("ช่องเซ็นชื่อ")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <span className="qa-pad-line" aria-hidden="true" />
      <button type="button" className="qa-pad-clear" onClick={clear}><Eraser size={15} aria-hidden="true" />{tr("ล้างลายเซ็น")}</button>
    </div>
  );
}

export default function QuoteApprovalPage({ token }: { token: string }) {
  const [state, setState] = React.useState<{ loading: true } | { error: string } | { data: QuoteView }>({ loading: true });
  const [name, setName] = React.useState('');
  const [signature, setSignature] = React.useState<string | null>(null);
  const [agree, setAgree] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [problem, setProblem] = React.useState('');
  const [full, setFull] = React.useState(false);
  const [width, setWidth] = React.useState(() => Math.min(window.innerWidth, 760));
  React.useEffect(() => { const onResize = () => setWidth(Math.min(window.innerWidth, 760)); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, []);
  React.useEffect(() => {
    let alive = true;
    apiJson<QuoteView>(`/api/quote-approval?t=${encodeURIComponent(token)}`)
      .then(data => { if (alive) setState({ data }); })
      .catch(error => { if (alive) setState({ error: (error as Error).message || tr("เปิดใบเสนอราคาไม่ได้ กรุณาลองใหม่") }); });
    return () => { alive = false; };
  }, [token]);

  const confirm = async () => {
    if (!('data' in state)) return;
    if (name.trim().length < 2) { setProblem(tr("กรุณาพิมพ์ชื่อผู้อนุมัติ")); return; }
    if (!signature) { setProblem(tr("กรุณาเซ็นชื่อในช่องเซ็นชื่อ")); return; }
    if (!agree) { setProblem(tr("กรุณาติ๊กยืนยันว่าตรวจใบเสนอราคาแล้ว")); return; }
    setProblem(''); setSending(true);
    try {
      const reply = await apiJson<{ approval: QuoteApproval }>('/api/quote-approval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', token, name: name.trim(), signature, agree: true }) });
      setState({ data: { ...state.data, approval: reply.approval } });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setProblem((error as Error).message || tr("ยืนยันไม่สำเร็จ กรุณาลองใหม่"));
    } finally { setSending(false); }
  };

  if ('loading' in state) return <main className="qa"><div className="qa-wrap"><p className="qa-muted">{tr("กำลังเปิดใบเสนอราคา…")}</p></div></main>;
  if ('error' in state) return (
    <main className="qa"><div className="qa-wrap">
      <header className="qa-brand"><BrandLockup size={28} /></header>
      <section className="qa-card qa-center" role="alert"><h1>{tr("เปิดลิงก์นี้ไม่ได้")}</h1><p>{state.error}</p></section>
    </div></main>
  );

  const { invoice, approval } = state.data;
  const shown = approval ? { ...invoice, approval } : invoice;
  const totals = calculateDocumentTotals(invoice.items, invoice.vatRate, invoice.whtRate);
  const scale = Math.max(0.3, (width - 32) / A4_WIDTH_PX);

  return (
    <main className="qa">
      <div className="qa-wrap">
        <header className="qa-brand"><BrandLockup size={28} /></header>
        <section className="qa-card">
          <p className="qa-kicker">{tr("ใบเสนอราคาจาก {0}", invoice.issuer.name || '-')}</p>
          <h1>{invoice.documentNo}</h1>
          <div className="qa-total"><span>{tr("ยอดรับสุทธิ")}</span><b>฿{formatMoney(totals.payable)}</b></div>
          {approval ? (
            <p className="qa-done" role="status"><CheckCircle2 size={18} aria-hidden="true" />{tr("ยืนยันแล้วโดย {0} เมื่อ {1}", approval.name, thaiDateTime(approval.at))}</p>
          ) : <p className="qa-muted">{tr("ตรวจรายละเอียดด้านล่าง แล้วเซ็นยืนยันท้ายหน้า")}</p>}
        </section>

        <button type="button" className="qa-paper" onClick={() => setFull(true)} aria-label={tr("ดูใบเสนอราคาเต็มจอ")}>
          <DocumentPreview invoice={shown} scale={scale} />
          <span className="qa-paper-pill"><Maximize2 size={14} aria-hidden="true" />{tr("แตะเพื่อขยาย")}</span>
        </button>

        {!approval && (
          <section className="qa-card qa-form" aria-labelledby="qa-form-title">
            <h2 id="qa-form-title">{tr("ยืนยันใบเสนอราคา")}</h2>
            <label className="qa-label" htmlFor="qa-name">{tr("ชื่อผู้อนุมัติ")}</label>
            <input id="qa-name" type="text" value={name} onChange={event => { setName(event.target.value); setProblem(''); }} placeholder={tr("ชื่อ-นามสกุล หรือชื่อบริษัท")} autoComplete="name" maxLength={120} />
            <span className="qa-label">{tr("ลายเซ็น")}</span>
            <SignaturePad onChange={value => { setSignature(value); setProblem(''); }} />
            <label className="qa-check"><input type="checkbox" checked={agree} onChange={event => { setAgree(event.target.checked); setProblem(''); }} />
              <span>{tr("ข้าพเจ้าตรวจรายการและยอดเงินในใบเสนอราคานี้แล้ว และยืนยันการสั่งซื้อหรือว่าจ้างตามใบเสนอราคานี้")}</span></label>
            {problem && <p className="qa-problem" role="alert">{problem}</p>}
            <button type="button" className="qa-confirm" onClick={() => void confirm()} disabled={sending}>{sending ? tr("กำลังยืนยัน…") : tr("ยืนยันใบเสนอราคา")}</button>
            <p className="qa-fine">{tr("เมื่อกดยืนยัน ระบบบันทึกชื่อ ลายเซ็น และเวลาที่ยืนยันไว้กับใบเสนอราคาฉบับนี้ ผู้ออกเอกสารจะเห็นในแอป")}</p>
          </section>
        )}
        <p className="qa-foot">{tr("ส่งผ่านกระรอกตุนเงิน")}</p>
      </div>
      {full && (
        <div className="qa-full" role="dialog" aria-modal="true" aria-label={tr("ใบเสนอราคา {0}", invoice.documentNo)}>
          <button type="button" className="qa-full-close" onClick={() => setFull(false)} aria-label={tr("ปิด")}><X size={20} /></button>
          <div className="qa-full-scroll"><DocumentPreview invoice={shown} scale={Math.max(0.4, (Math.min(window.innerWidth, 900) - 24) / A4_WIDTH_PX)} /></div>
        </div>
      )}
    </main>
  );
}
