import React from 'react';
import { tr } from '../../i18n/tr';
import { LINE_CATEGORIES, LINE_THEMES, type LineBlock, type LineCardData, type LineDueAction, type LineItem, type LineRow } from './lineMock';

// A LINE Flex card exactly as the app sends it (backend/src/services/lineCards.ts lineCard): the gradient
// band with the white brand symbol, the category chip, title, hairline and key amount beside the official
// mascot pose, then the white statement body, the note and the primary button. Sizes follow LINE's own
// scale (xs 13, sm 14, md 16, lg 19, xxl 29); weights follow the chat's 400 / 500 / 600.

type Props = {
  card: LineCardData;
  onDue?: (action: LineDueAction, item: LineItem) => void;
  onOpen?: (path: string) => void;
};

const amountClass = (value: string) => value.length <= 9 ? 'is-xxl' : value.length <= 13 ? 'is-xl' : 'is-lg';

function Row({ row }: { row: LineRow }) {
  return (
    <div className="lnc-row">
      <span className="lnc-row-label">{row.label}{row.caption && <small>{row.caption}</small>}</span>
      <span className={`lnc-row-value is-${row.tone ?? 'text'}${row.strong ? ' is-strong' : ''}`}>{row.value}</span>
    </div>
  );
}

function Item({ item, onDue }: { item: LineItem; onDue?: Props['onDue'] }) {
  return (
    <div className="lnc-item">
      <div className="lnc-item-top"><span className="lnc-item-name">{item.name}</span><span className="lnc-item-amount">{item.amount}</span></div>
      <div className="lnc-item-client">{item.client}</div>
      {item.meta && <div className={`lnc-item-meta is-${item.metaTone ?? 'muted'}`}>{item.meta}</div>}
      {item.due && onDue && (
        <div className="lnc-due" role="group" aria-label={tr("บันทึกรับเงิน {0}", item.name)}>
          <button type="button" className="lnc-pill is-primary" onClick={() => onDue('paid', item)}>{tr("ได้รับแล้ว")}</button>
          <button type="button" className="lnc-pill" onClick={() => onDue('later', item)}>{tr("ยังไม่ได้")}</button>
          <button type="button" className="lnc-pill" onClick={() => onDue('partial', item)}>{tr("ได้ไม่ครบ")}</button>
        </div>
      )}
    </div>
  );
}

function Block({ block, onDue }: { block: LineBlock; onDue?: Props['onDue'] }) {
  switch (block.kind) {
    case 'divider': return <hr className="lnc-divider" />;
    case 'rows': return <div className="lnc-rows">{block.rows.map(row => <Row key={row.label} row={row} />)}</div>;
    case 'items': return <div className="lnc-items">{block.items.map(item => <Item key={item.id} item={item} onDue={onDue} />)}</div>;
    case 'section': return (
      <section className="lnc-section">
        <h4 className={`is-${block.tone}`}><i aria-hidden="true" />{block.title}</h4>
        {block.items.map(item => <Item key={item.id} item={item} onDue={onDue} />)}
      </section>
    );
  }
}

export function LineCard({ card, onDue, onOpen }: Props) {
  const category = LINE_CATEGORIES[card.category];
  const theme = LINE_THEMES[category.theme];
  const band = { background: `linear-gradient(120deg, ${theme.start}, ${theme.center} 55%, ${theme.end})` } as React.CSSProperties;
  return (
    <article className="lnc" aria-label={card.alt}>
      <header className={`lnc-band${card.metric ? ' has-metric' : ''}`} style={band}>
        <div className="lnc-brand">
          <img src="/brand/logo01-v1/symbol-white.png" alt="" width={18} height={18} />
          <span className="lnc-brand-name">กระรอกตุนเงิน</span>
          <span className="lnc-chip"><img src={`/line/icons/${category.icon}.png`} alt="" width={12} height={12} />{tr(category.label)}</span>
        </div>
        {card.metric ? (
          <>
            <h3 className="lnc-title">{card.title}</h3>
            {card.subtitle && <p className="lnc-subtitle">{card.subtitle}</p>}
            <hr className="lnc-hairline" />
            <div className="lnc-hero">
              <div className="lnc-metric">
                <span className="lnc-metric-label">{card.metric.label}</span>
                <span className={`lnc-metric-value ${amountClass(card.metric.value)}`}>{card.metric.value}</span>
                {card.metric.note && <span className="lnc-metric-note">{card.metric.note}</span>}
              </div>
              <span className="lnc-figure" aria-hidden="true"><img src={`/line/mascot-v6-${category.pose}.png`} alt="" width={80} height={80} /></span>
            </div>
          </>
        ) : (
          <div className="lnc-hero is-title">
            <div className="lnc-metric"><h3 className="lnc-title">{card.title}</h3>{card.subtitle && <p className="lnc-subtitle">{card.subtitle}</p>}</div>
            <span className="lnc-figure is-small" aria-hidden="true"><img src={`/line/mascot-v6-${category.pose}.png`} alt="" width={72} height={72} /></span>
          </div>
        )}
      </header>
      <div className="lnc-body">
        {card.blocks.map((block, n) => <Block key={n} block={block} onDue={onDue} />)}
        {card.note && <><hr className="lnc-divider is-note" /><p className="lnc-note">{card.note}</p></>}
      </div>
      {card.footer && (
        <div className="lnc-footer">
          <a className="lnc-button" href={card.footer.path} onClick={event => { if (!onOpen) return; event.preventDefault(); onOpen(card.footer!.path); }}>{card.footer.label}</a>
        </div>
      )}
    </article>
  );
}
