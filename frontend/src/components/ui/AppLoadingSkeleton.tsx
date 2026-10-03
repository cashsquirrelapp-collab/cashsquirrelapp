import type { CSSProperties, ReactNode } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { uiSurface } from './uiStyles';

type SkeletonPage = 'dashboard' | 'adminDashboard' | 'jobs' | 'calendar' | 'clients'
  | 'receivables' | 'incomeExpense' | 'split' | 'report' | 'insight' | 'tax'
  | 'invoice' | 'groups' | 'plans' | 'settings';

const items = (count: number) => Array.from({ length: count }, (_, index) => index);

export const SkeletonBlock = ({ className = '', style }: { className?: string; style?: CSSProperties }) => (
  <div aria-hidden="true" className={`app-skeleton-block ${className}`} style={style} />
);
const Block = SkeletonBlock;
const Card = ({ children, className = 'p-[18px]' }: { children: ReactNode; className?: string }) => (
  <div className={`${uiSurface} ${className}`}>{children}</div>
);

function LoadingFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { language } = useLanguage();
  return <div role="status" aria-busy="true" className={`min-w-0 ${className}`}>
    <span className="sr-only">{language === 'th' ? 'กำลังโหลดเนื้อหา' : 'Loading content'}</span>
    <div aria-hidden="true" className="app-skeleton-content">{children}</div>
  </div>;
}

function Lines({ wide = false }: { wide?: boolean }) {
  return <div className={`min-w-0 space-y-2 ${wide ? 'w-full' : ''}`}>
    <Block className={`h-4 ${wide ? 'w-3/4' : 'w-32 max-w-full'}`} />
    <Block className={`h-3 ${wide ? 'w-1/2' : 'w-24 max-w-full'}`} />
  </div>;
}

function Header({ page }: { page: SkeletonPage }) {
  const actions: Partial<Record<SkeletonPage, string[]>> = {
    dashboard: ['w-36', 'w-10', 'w-10', 'w-24'], adminDashboard: ['w-28'],
    jobs: ['w-28'], calendar: ['w-48'], incomeExpense: ['w-28', 'w-28'],
    invoice: ['w-36'], groups: ['w-28', 'w-28'], tax: ['w-36', 'w-36', 'w-32', 'w-40'],
    split: ['w-52'], plans: ['w-12'],
  };
  return <div className="ui-page-header">
    <div className="min-w-0 flex-1 space-y-2">
      <Block className="h-8 w-48 max-w-full sm:w-64" />
      <Block className="h-3.5 w-full max-w-[420px]" />
    </div>
    {actions[page] && <div className="ui-page-actions">
      {actions[page]!.map((width, index) => <Block key={index} className={`h-10 max-w-full rounded-[10px] ${width}`} />)}
    </div>}
  </div>;
}

function Tabs({ count = 3, size = 'w-28' }: { count?: number; size?: string }) {
  return <div className="flex gap-2 overflow-hidden">
    {items(count).map(index => <Block key={index} className={`h-10 ${size} shrink-0 rounded-[10px]`} />)}
  </div>;
}

function Stats({ count = 4, className = 'grid-cols-2 sm:grid-cols-4', icon = false, large = false, compact = false }: {
  count?: number; className?: string; icon?: boolean; large?: boolean; compact?: boolean;
}) {
  return <div className={`grid gap-3 ${className}`}>
    {items(count).map(index => <Card key={index} className={large ? 'ui-panel min-h-32' : compact ? 'p-[14px]' : 'p-[18px]'}>
      {icon && !large && <Block className="mb-2 h-5 w-5" />}
      <div className="flex items-center justify-between gap-2">
        <Block className="h-3 w-24 max-w-full" />
        {large && <Block className="h-[18px] w-[18px] shrink-0" />}
      </div>
      <Block className={`${large ? 'mt-4 h-9' : compact ? 'mt-1 h-5' : 'mt-1 h-7'} w-24 max-w-full`} />
    </Card>)}
  </div>;
}

function Chart({ height = 'h-64', bars = 12 }: { height?: string; bars?: number }) {
  const daily = bars === 30;
  return <Card className="space-y-4 p-[18px]">
    <Block className="h-4 w-36 max-w-full" />
    <div className={`${daily ? 'grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1 sm:gap-1.5' : 'flex gap-2'} items-end border-b border-brand-border pb-2 pt-4 ${height}`}>
      {items(bars).map(index => <Block key={index} className={`min-w-0 rounded-t-md rounded-b-none ${daily ? '' : 'flex-1'}`} style={{ height: `${[35, 60, 45, 75, 55, 85][index % 6]}%` }} />)}
    </div>
    <div className="flex gap-4"><Block className="h-3 w-20" /><Block className="h-3 w-20" /></div>
  </Card>;
}

function Rows({ count = 4, avatar = false, actions = false }: { count?: number; avatar?: boolean; actions?: boolean }) {
  return <div className="divide-y divide-brand-border/50">
    {items(count).map(index => <div key={index} className="flex flex-wrap items-center gap-3 py-4">
      {avatar && <Block className="h-9 w-9 shrink-0 rounded-full" />}
      <div className="min-w-0 flex-1"><Lines wide /></div>
      <Block className={`${actions ? 'h-10 w-24 rounded-[10px]' : 'h-4 w-16'} shrink-0`} />
    </div>)}
  </div>;
}

function Table({ columns = 6, mobileCards = false, compactColumns = false, horizontal = false }: { columns?: number; mobileCards?: boolean; compactColumns?: boolean; horizontal?: boolean }) {
  const gridColumns = compactColumns ? 'grid-cols-5 lg:grid-cols-7' : columns === 3 ? 'grid-cols-3' : columns === 5 ? 'grid-cols-5' : columns === 7 ? 'grid-cols-7' : 'grid-cols-6';
  const responsiveColumn = (index: number) => compactColumns && (index === 1 || index === 4) ? 'hidden lg:block' : '';
  return <>
    {mobileCards && <div className="space-y-3 sm:hidden">
      {items(4).map(index => <Card key={index}><Rows count={1} actions /><Block className="h-3 w-2/3" /></Card>)}
    </div>}
    <div className={horizontal ? 'overflow-x-auto' : ''}>
      <Card className={`overflow-hidden ${mobileCards ? 'hidden sm:block' : ''}`}>
        <div className={`grid ${gridColumns} ${horizontal ? 'min-w-[640px]' : ''} gap-3 border-b border-brand-border bg-brand-faint/40 px-4 py-3 sm:gap-4`}>
          {items(columns).map(index => <Block key={index} className={`h-3 w-3/4 ${responsiveColumn(index)}`} />)}
        </div>
        {items(5).map(row => <div key={row} className={`grid ${gridColumns} ${horizontal ? 'min-w-[640px]' : ''} items-center gap-3 border-b border-brand-border/50 px-4 py-4 last:border-0 sm:gap-4`}>
          <Lines wide />{items(columns - 1).map(index => <Block key={index} className={`h-3 w-3/4 ${responsiveColumn(index + 1)}`} />)}
        </div>)}
      </Card>
    </div>
  </>;
}

function CalendarGrid({ compact = false }: { compact?: boolean }) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const dayCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((firstDay + dayCount) / 7) * 7;
  return <div>
    <div className="grid grid-cols-7 gap-1 py-3">
      {items(7).map(index => <Block key={index} className="mx-auto h-3 w-4" />)}
    </div>
    <div className={`grid grid-cols-7 ${compact ? 'gap-1' : 'gap-1.5 overflow-x-auto'}`}>
      {items(cells).map(index => <div key={index} className={compact ? 'flex h-8 items-center justify-center' : 'flex min-h-[78px] min-w-0 flex-col items-start gap-0.5 rounded-[10px] border border-brand-border bg-brand-white p-1.5'}>
        <Block className="h-3 w-4" />
        {!compact && index % 5 === 2 && <Block className="mt-1.5 h-4 w-full rounded" />}
      </div>)}
    </div>
  </div>;
}

function Dashboard() {
  return <div className="space-y-5">
    <Card className="flex flex-col gap-3 p-[18px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-4">
        <Block className="hidden h-12 w-12 shrink-0 rounded-[14px] sm:block" />
        <div className="space-y-2"><Block className="h-4 w-36" /><Block className="h-9 w-40" /><Block className="h-3 w-28" /></div>
      </div>
      <div className="hidden h-12 w-28 items-end gap-1.5 sm:flex">
        {items(6).map(index => <Block key={index} className="flex-1 rounded-t" style={{ height: `${25 + index * 12}%` }} />)}
      </div>
    </Card>
    <div><Stats /><Block className="mt-2.5 h-3 w-56 max-w-full" /></div>
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items(4).map(index => <Card key={index} className="flex items-center gap-2.5 rounded-xl px-3.5 py-3">
        <Block className="h-[30px] w-[30px] shrink-0 rounded-[9px]" /><Block className="h-3 w-20 max-w-full" />
      </Card>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Chart /><Card><Block className="h-4 w-32" /><Rows count={4} /></Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card><Block className="h-4 w-32" /><Rows count={3} avatar /></Card>
      <Card><Block className="h-4 w-28" /><CalendarGrid compact /></Card>
    </div>
  </div>;
}

function Calendar() {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Block className="h-6 w-40" />
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1.5"><Block className="h-8 w-8 rounded-lg" /><Block className="h-8 w-12 rounded-lg" /><Block className="h-8 w-8 rounded-lg" /></div>
        <div className="flex gap-1.5"><Block className="h-8 w-16 rounded-lg" /><Block className="h-8 w-20 rounded-lg" /></div>
      </div>
    </div>
    <div className="flex flex-wrap gap-3">{items(5).map(index => <Block key={index} className="h-3 w-20" />)}</div>
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0 overflow-x-auto"><CalendarGrid /></div>
      <Card><Block className="mb-3 h-4 w-40 max-w-full" /><Rows count={3} /></Card>
    </div>
  </div>;
}

function MobileRecords({ expenses = false }: { expenses?: boolean }) {
  return <div className="space-y-2 sm:hidden">
    {items(4).map(index => <Card key={index} className="px-4 py-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1 space-y-2"><Block className="h-4 w-36 max-w-full" /><Block className="h-3 w-48 max-w-full" /></div><Block className="h-4 w-20 shrink-0" /></div>
      <div className="mt-2 flex items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-center gap-1.5"><Block className="h-5 w-16 rounded-full" /><Block className="h-5 w-16 rounded-full" />{expenses && <Block className="h-5 w-16 rounded-full" />}</div><Block className="h-8 w-8 shrink-0 rounded-lg" /></div>
    </Card>)}
  </div>;
}

function Records({ expenses = false }: { expenses?: boolean }) {
  return <div className="space-y-4">
    {expenses ? <>
      <Block className="h-10 w-40 rounded-[10px]" />
      <Card className="grid grid-cols-3 divide-x divide-brand-border px-4 py-3">
        {items(3).map(index => <div key={index} className="min-w-0 space-y-2 px-2"><Block className="h-3 w-16 max-w-full" /><Block className="h-6 w-24 max-w-full" /></div>)}
      </Card>
    </> : <Tabs count={4} size="w-24" />}
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      {expenses && <Tabs size="w-20" />}
      <Block className="h-10 w-full min-w-0 shrink-0 rounded-xl lg:flex-1" />
      <div className="flex items-center gap-2">
        <Block className="h-10 min-w-0 flex-1 rounded-xl sm:w-[150px] sm:flex-none" />
        {(!expenses) && <Block className="hidden h-10 w-32 rounded-xl sm:block" />}
        <Block className="h-10 w-24 shrink-0 rounded-xl" />
      </div>
    </div>
    {expenses ? <>
      <div className="hidden sm:block"><Table columns={6} /></div>
      <MobileRecords expenses />
    </> : <>
      <div className="hidden sm:block"><Table columns={7} compactColumns /></div>
      <MobileRecords />
    </>}
  </div>;
}

function Documents() {
  return <div className="space-y-6">
    <Tabs count={4} />
    <div className="grid min-h-[680px] grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <Card className="overflow-hidden rounded-2xl">
        <div className="border-b border-brand-border px-5 py-4"><Lines /></div>
        <div className="px-5"><Rows count={5} /></div>
      </Card>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2">{items(4).map(index => <Block key={index} className="h-9 w-24 rounded-[10px]" />)}</div>
        <div className="min-h-[620px] rounded-2xl border border-brand-border bg-brand-faint/40 p-4 sm:p-7 lg:p-10">
          <Card className="mx-auto min-h-[540px] max-w-[600px] space-y-8 rounded-none p-6 sm:p-10">
            <div className="flex items-start justify-between gap-4"><Block className="h-14 w-14 shrink-0" /><Lines /></div>
            <div className="grid grid-cols-2 gap-6"><Lines wide /><Lines wide /></div>
            <Block className="h-6 w-36" /><Table columns={3} />
            <div className="ml-auto w-1/2 space-y-3"><Block className="h-3 w-full" /><Block className="h-5 w-full" /></div>
          </Card>
        </div>
      </div>
    </div>
  </div>;
}

function Report({ insight = false }: { insight?: boolean }) {
  return <div className="space-y-4">
    <Tabs />
    {insight ? <>
      <div className="flex justify-end"><Block className="h-10 w-40 rounded-[10px]" /></div>
      <Stats count={3} className="grid-cols-1 sm:grid-cols-3" />
      <Chart />
      <div className="flex justify-end"><Tabs count={2} /></div>
      <div className="grid gap-6 lg:grid-cols-2"><Chart /><Chart /></div>
    </> : <><Stats count={4} icon /><Chart height="h-[120px]" /></>}
  </div>;
}

function Goals() {
  return <div className="space-y-6">
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-5 py-5 sm:px-7"><Lines wide /><Block className="h-7 w-28 rounded-full" /></div>
      <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex h-56 w-56 max-w-full items-center justify-center rounded-full border-[25px] border-brand-faint"><Lines /></div>
          <Block className="h-3 w-44" />
        </div>
        <div className="space-y-4"><Stats count={3} className="grid-cols-1 sm:grid-cols-3" /><Card className="p-4"><Block className="h-4 w-36" /><Rows count={3} /></Card></div>
      </div>
    </Card>
    <Stats />
    <div className="flex justify-between gap-3"><Block className="h-6 w-40" /><Block className="h-10 w-28 rounded-[10px]" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items(3).map(index => <Card key={index} className="space-y-4 p-5"><Block className="h-12 w-12 rounded-xl" /><Lines wide /><Block className="h-2 w-full rounded-full" /><Block className="h-10 w-full rounded-[10px]" /></Card>)}
    </div>
  </div>;
}

function Settings() {
  return <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
    <div className="hidden w-[200px] shrink-0 space-y-1 lg:block">
      <Block className="mb-3 h-5 w-20" />
      {items(8).map(index => <div key={index} className="flex items-center gap-2.5 px-3 py-2.5"><Block className="h-4 w-4 shrink-0" /><Block className="h-3 w-28" /></div>)}
    </div>
    <div className="lg:hidden"><Tabs count={8} /></div>
    <div className="min-w-0 flex-1 space-y-6 lg:max-w-2xl">
      <Lines />
      {items(3).map(index => <Card key={index} className="space-y-3 p-5">
        <Lines /><Block className="h-[42px] w-full rounded-[10px]" />
        {index === 0 && <Block className="h-10 w-28 rounded-[10px]" />}
      </Card>)}
    </div>
  </div>;
}

function GroupPanels({ embedded = false }: { embedded?: boolean }) {
  return <div className="space-y-6">
    {!embedded && <><Stats count={3} className="grid-cols-1 sm:grid-cols-3" icon /><Tabs /></>}
    <div className="grid gap-6 xl:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
      <Card className="ui-panel self-start"><Block className="h-5 w-28" /><Rows count={3} /><Block className="mt-4 h-8 w-28" /></Card>
      <Card className="ui-panel space-y-5"><Lines /><Block className="h-3 w-3/4" /><Rows count={4} avatar actions /></Card>
    </div>
  </div>;
}

function AdminDashboard() {
  return <div className="space-y-5">
    <Stats count={7} className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" large />
    <Card className="ui-panel space-y-5">
      <div className="space-y-2"><Block className="h-3 w-32" /><Block className="h-7 w-52 max-w-full" /><Block className="h-3 w-72 max-w-full" /></div>
      <Stats count={3} className="grid-cols-1 sm:grid-cols-3" compact />
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Chart height="h-32" bars={30} /><Card className="p-5"><Block className="h-4 w-36" /><Rows count={5} /></Card>
      </div>
    </Card>
    <Card className="ui-panel flex flex-wrap items-center justify-between gap-4"><Lines /><div className="flex gap-2"><Block className="h-10 w-28" /><Block className="h-10 w-28" /></div></Card>
  </div>;
}

export function AdminUsersLoadingSkeleton() {
  return <LoadingFrame><Card className="ui-panel space-y-5">
    <div className="flex justify-between gap-3"><Lines wide /><Block className="h-3 w-16" /></div>
    <div className="flex gap-2"><Block className="h-[42px] min-w-0 flex-1 rounded-[10px]" /><Block className="h-10 w-20 shrink-0 rounded-[10px]" /></div>
    <div className="space-y-3 rounded-2xl border border-brand-border p-4"><Lines wide /><Block className="h-10 w-36 rounded-[10px]" /><Block className="h-10 w-full rounded-xl" /></div>
    <Rows count={4} actions />
  </Card></LoadingFrame>;
}

export function GroupsLoadingSkeleton() {
  return <LoadingFrame><GroupPanels embedded /></LoadingFrame>;
}

export function AdminDetailsLoadingSkeleton() {
  return <LoadingFrame><div className="min-w-0">
    <div className="mb-3 flex items-center justify-between gap-3"><Block className="h-4 w-20" /><Block className="h-3 w-16" /></div>
    <div className="divide-y divide-brand-border/50">
      {items(3).map(index => <div key={index} className="flex flex-wrap items-start justify-between gap-3 py-4">
        <div className="min-w-0 flex-1 space-y-2"><Block className="h-5 w-40 max-w-full" /><Block className="h-3 w-64 max-w-full" /><Block className="h-3 w-48 max-w-full" /></div>
        <Block className="h-8 w-28 rounded-full" />
      </div>)}
    </div>
  </div></LoadingFrame>;
}

function Plans() {
  return <div className="space-y-6">
    <div className="grid gap-5 md:grid-cols-2">
      {items(2).map(index => <Card key={index} className="ui-panel space-y-4">
        <Block className="h-5 w-32" /><Block className="h-8 w-36" />
        {items(5).map(row => <div key={row} className="flex items-center gap-2"><Block className="h-4 w-4 shrink-0" /><Block className="h-3 w-3/4" /></div>)}
        <Block className="h-10 w-full rounded-[10px]" />
      </Card>)}
    </div>
    <Card className="ui-panel flex flex-col items-center gap-3"><Block className="h-5 w-48 max-w-full" /><Block className="h-3 w-72 max-w-full" /><Block className="h-10 w-40 rounded-[10px]" /></Card>
  </div>;
}

function Tax() {
  return <div className="space-y-6">
    <Stats count={5} className="grid-cols-2 sm:grid-cols-5" compact />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items(4).map(index => <Block key={index} className="h-16 rounded-[14px]" />)}</div>
    <Card className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap justify-between gap-3"><Block className="h-4 w-36" /><Block className="h-8 w-48" /></div>
      <Block className="h-7 w-36" /><Block className="h-3 w-3/4" />
      {items(2).map(index => <div key={index} className="space-y-3 rounded-2xl border border-brand-border bg-brand-faint/30 p-4">
        <Block className="h-4 w-48 max-w-full" />
        <div className="grid gap-3 sm:grid-cols-2">{items(2).map(field => <div key={field} className="space-y-2"><Block className="h-3 w-28" /><Block className="h-9 w-full rounded-xl" /></div>)}</div>
      </div>)}
    </Card>
  </div>;
}

function Receivables() {
  return <div className="mx-auto max-w-[860px] space-y-6">
    <div className="space-y-2"><Block className="h-3 w-28" /><Block className="h-9 w-40" /><Block className="h-3 w-36" /></div>
    {items(2).map(index => <div key={index} className="space-y-3"><Block className="h-4 w-32" />
      {items(2).map(row => <Card key={row}><Rows count={1} actions /><Block className="h-3 w-1/2" /></Card>)}
    </div>)}
  </div>;
}

function PageBody({ page }: { page: SkeletonPage }) {
  switch (page) {
    case 'dashboard': return <Dashboard />;
    case 'adminDashboard': return <AdminDashboard />;
    case 'jobs': return <Records />;
    case 'incomeExpense': return <Records expenses />;
    case 'calendar': return <Calendar />;
    case 'clients': return <Table horizontal />;
    case 'receivables': return <Receivables />;
    case 'invoice': return <Documents />;
    case 'report': return <Report />;
    case 'insight': return <Report insight />;
    case 'split': return <Goals />;
    case 'settings': return <Settings />;
    case 'groups': return <GroupPanels />;
    case 'plans': return <Plans />;
    case 'tax': return <Tax />;
  }
}

export function ContentLoadingSkeleton({ page = 'dashboard', includeHeader = true }: {
  page?: SkeletonPage; includeHeader?: boolean;
}) {
  return <LoadingFrame className={page === 'plans' ? 'mx-auto max-w-4xl' : ''}>
    {includeHeader && <Header page={page} />}
    <PageBody page={page} />
  </LoadingFrame>;
}
