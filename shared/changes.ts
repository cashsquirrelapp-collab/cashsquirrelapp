import type { Change } from './validation.js';
export type Baseline = Record<string, Record<string,{data:any;version:number}>>;
export const fieldTables:Record<string,Change['table']>={jobs:'cashflow_jobs',expenses:'cashflow_expenses',goals:'cashflow_goals',invoices:'cashflow_invoices'};
export function diffSnapshot(baseline:Baseline, payload:Record<string,any>):Change[] {
 const changes:Change[]=[];
 for(const [field,data] of Object.entries(payload)) {
  if(data===undefined) continue;
  const table=fieldTables[field]||'cashflow_documents';
  const records=fieldTables[field]?Object.fromEntries((data as any[]).map(row=>[row.id,row])):{[field]:data};
  const before=baseline[table]||{};
  for(const [id,value] of Object.entries(records)) if(JSON.stringify(value)!==JSON.stringify(before[id]?.data)) changes.push({table,id,op:'set',version:before[id]?.version??null,data:value});
  if(fieldTables[field]) for(const [id,row] of Object.entries(before)) if(!(id in records)) changes.push({table,id,op:'delete',version:row.version});
 }
 return changes;
}
export function commitChanges(baseline:Baseline,changes:Change[]) {
 for(const change of changes) { const records=baseline[change.table]??={}; if(change.op==='delete') delete records[change.id]; else records[change.id]={data:structuredClone(change.data),version:(change.version??0)+1}; }
}
