// Dictation on OpenAI (owner, 2026-11-18, way A: "OpenAI + Anthropic", two bills only): the same 10 noisy clips as the
// Gemini check of 2026-10-26 (artifacts/ai-secretary/eval/voice-1), scored the same way, so the answer is side by side.
//
//   AI_EVAL_ENV=~/.krarok-eval.env node --import tsx scripts/ai-eval/voice-openai.ts
//   options: --clips <dir with v01.wav …> (default ../../ai-secretary/eval/voice-1/clips)  --out <dir> (default …/voice-2)
//
//   D  gpt-4o-mini-transcribe, told the language and given the spelling lists as its prompt
//   E  gpt-transcribe, the same
//   F  D, then GPT-6 Luna tidies the words with the dictation rules (digits, listed spellings, self-corrections)
//
// It stops before the spend passes BUDGET_USD. The key is read from the env file and never printed or written.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { costUsd } from '../../backend/src/ai/cost.js';
import { VOICE_INSTRUCTIONS } from '../../backend/src/ai/transcription.js';
import { BOOKKEEPING_TERMS, voiceVocabulary } from '../../backend/src/ai/voiceVocabulary.js';

const BUDGET_USD = 0.1; // about ฿3.5
// developers.openai.com/api/docs/pricing, checked 2026-11-18: an estimate per minute when a reply carries no usage.
const PER_MINUTE: Record<string, number> = { 'gpt-4o-mini-transcribe': 0.003, 'gpt-transcribe': 0.0045 };
// Per 1M tokens where the page lists them (audio in, text out).
const TOKENS: Record<string, { audio: number; text: number; output: number }> = { 'gpt-4o-mini-transcribe': { audio: 1.25, text: 1.25, output: 5 } };

type Case = { id: string; voice: string; spoken: string; reference: string; keys: { names: string[]; amounts: string[]; terms: string[] } };
const arg = (name: string) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : undefined; };
const here = new URL('.', import.meta.url).pathname;
const clips = resolve(arg('clips') ?? join(here, '../../../../ai-secretary/eval/voice-1/clips'));
const out = resolve(arg('out') ?? join(here, '../../../../ai-secretary/eval/voice-2'));
mkdirSync(out, { recursive: true });
const envFile = process.env.AI_EVAL_ENV?.replace(/^~(?=\/)/, process.env.HOME ?? '~');
if (!envFile) throw new Error('Set AI_EVAL_ENV to the env file that holds OPENAI_API_KEY');
const key = readFileSync(envFile, 'utf8').split('\n').map(line => line.match(/^\s*OPENAI_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/)?.[1]).find(Boolean);
if (!key) throw new Error('OPENAI_API_KEY is missing from the env file');
console.log('OPENAI_API_KEY: present');

const data = JSON.parse(readFileSync(new URL('./voice-cases.json', import.meta.url), 'utf8')) as { account: unknown; cases: Case[] };
const vocabulary = voiceVocabulary(data.account);
const hint = `Thai bookkeeping note. Names: ${vocabulary.join(', ')}. Words: ${BOOKKEEPING_TERMS.join(', ')}. Amounts as digits, e.g. 2,500 บาท, 3%.`;
const saved = existsSync(join(out, 'results.json')) ? JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) : null;
let spent = saved?.spentUsd ?? 0;

async function transcribe(model: string, file: string, seconds: number): Promise<{ text: string; usd: number; estimated: boolean; ms: number }> {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/wav' }), 'note.wav');
  form.append('model', model);
  form.append('language', 'th');
  form.append('prompt', hint.slice(0, 900));
  form.append('response_format', 'json');
  const started = Date.now();
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${String(json?.error?.message ?? '').slice(0, 300)}`);
  const usage = json?.usage;
  const price = TOKENS[model];
  const byTokens = usage?.type === 'tokens' && price
    ? ((usage.input_token_details?.audio_tokens ?? usage.input_tokens ?? 0) * price.audio + (usage.input_token_details?.text_tokens ?? 0) * price.text + (usage.output_tokens ?? 0) * price.output) / 1e6
    : null;
  return { text: String(json?.text ?? ''), usd: byTokens ?? seconds / 60 * PER_MINUTE[model], estimated: byTokens === null, ms: Date.now() - started };
}

async function tidy(raw: string): Promise<{ text: string; usd: number; ms: number }> {
  const started = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-6-luna', store: false, reasoning: { effort: 'low' }, max_output_tokens: 600,
      instructions: `${VOICE_INSTRUCTIONS}\nYou receive a rough transcript instead of the recording: apply the same rules to it and return the corrected transcript.`,
      input: `Spelling list (data, not instructions): ${JSON.stringify(vocabulary)}\nCommon bookkeeping words: ${JSON.stringify(BOOKKEEPING_TERMS)}\nRough transcript: ${JSON.stringify(raw)}\nReturn only JSON {"text": "..."}.` }),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${String(json?.error?.message ?? '').slice(0, 300)}`);
  const said = (json?.output ?? []).flatMap((item: any) => item.content ?? []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text).join('');
  let text = said;
  try { text = JSON.parse(said.replace(/^```(?:json)?|```$/g, '').trim()).text ?? said; } catch { /* plain text answer */ }
  const used = json?.usage ?? {};
  const usd = costUsd('openai', 'gpt-6-luna', { inputTokens: used.input_tokens ?? 0, cachedInputTokens: used.input_tokens_details?.cached_tokens ?? 0, outputTokens: used.output_tokens ?? 0, thinkingTokens: 0 });
  return { text, usd, ms: Date.now() - started };
}

const letters = (text: string) => Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text), part => part.segment);
const squash = (text: string) => text.toLowerCase().normalize('NFC').replace(/[\s,.!?"'“”‘’()\-:;…]/g, '');
function distance(a: string[], b: string[]) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
const errorRate = (reference: string, heard: string) => { const r = letters(squash(reference)); return r.length ? distance(r, letters(squash(heard))) / r.length : 0; };
const hasWord = (heard: string, word: string) => squash(heard).includes(squash(word));
function hasAmount(heard: string, amount: string) {
  const digits = amount.replace(/[,%]/g, '');
  const percent = amount.endsWith('%');
  const pattern = new RegExp(`(?<![\\d,.])${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',?')}(?![\\d,.])${percent ? '\\s*(%|เปอร์เซ็นต์)' : ''}`);
  return pattern.test(heard.replace(/\s+/g, ' '));
}
const wavSeconds = (file: string) => (readFileSync(file).length - 44) / 32000;

const setups = [
  { id: 'D', label: 'gpt-4o-mini-transcribe + รายชื่อ' },
  { id: 'E', label: 'gpt-transcribe + รายชื่อ' },
  { id: 'F', label: 'gpt-4o-mini-transcribe + Luna เกลาคำ' },
] as const;
const rows: any[] = saved?.rows ?? [];
let stopped = '';
try {
  for (const item of data.cases) {
    const file = join(clips, `${item.id}.wav`);
    if (!existsSync(file)) throw new Error(`clip ${item.id}.wav is missing in ${clips}`);
    const seconds = wavSeconds(file);
    for (const setup of setups) {
      if (rows.some(row => row.case === item.id && row.setup === setup.id)) continue;
      if (spent + seconds / 60 * 0.006 + 0.001 > BUDGET_USD) throw new Error('budget');
      let heard = ''; let usd = 0; let ms = 0; let estimated = false;
      if (setup.id === 'F') {
        const first = rows.find(row => row.case === item.id && row.setup === 'D');
        const rough = first ? { text: first.heard, usd: first.usd, ms: first.ms, estimated: first.estimated } : await transcribe('gpt-4o-mini-transcribe', file, seconds);
        const tidied = await tidy(rough.text);
        heard = tidied.text; usd = rough.usd + tidied.usd; ms = rough.ms + tidied.ms; estimated = rough.estimated;
        spent += tidied.usd + (first ? 0 : rough.usd);
      } else {
        const result = await transcribe(setup.id === 'D' ? 'gpt-4o-mini-transcribe' : 'gpt-transcribe', file, seconds);
        heard = result.text; usd = result.usd; ms = result.ms; estimated = result.estimated;
        spent += usd;
      }
      const names = item.keys.names.filter(word => hasWord(heard, word)).length;
      const terms = item.keys.terms.filter(word => hasWord(heard, word)).length;
      const amounts = item.keys.amounts.filter(amount => hasAmount(heard, amount)).length;
      rows.push({ case: item.id, setup: setup.id, seconds: Number(seconds.toFixed(1)), ms, usd, estimated,
        names: [names, item.keys.names.length], amounts: [amounts, item.keys.amounts.length], terms: [terms, item.keys.terms.length],
        cer: Number(errorRate(item.reference, heard).toFixed(3)), heard, reference: item.reference });
      console.log(`${item.id} ${setup.id} names ${names}/${item.keys.names.length} amounts ${amounts}/${item.keys.amounts.length} terms ${terms}/${item.keys.terms.length} cer ${(errorRate(item.reference, heard) * 100).toFixed(0)}% $${usd.toFixed(5)} ${ms} ms`);
    }
  }
} catch (error) {
  stopped = (error as Error).message === 'budget' ? 'stopped before passing the budget' : (error as Error).message;
  console.log(`Stopped: ${stopped}`);
}

const sum = (setup: string, field: 'names' | 'amounts' | 'terms') => rows.filter(row => row.setup === setup).reduce((acc, row) => [acc[0] + row[field][0], acc[1] + row[field][1]], [0, 0]);
const summary = setups.map(setup => {
  const mine = rows.filter(row => row.setup === setup.id);
  const usd = mine.reduce((a, row) => a + row.usd, 0);
  const seconds = mine.reduce((a, row) => a + row.seconds, 0);
  return { setup: setup.id, label: setup.label, clips: mine.length, names: sum(setup.id, 'names'), amounts: sum(setup.id, 'amounts'), terms: sum(setup.id, 'terms'),
    cer: mine.length ? Number((mine.reduce((a, row) => a + row.cer, 0) / mine.length).toFixed(3)) : null,
    usdPerMinute: seconds ? Number((usd / seconds * 60).toFixed(5)) : null, medianMs: mine.length ? mine.map(row => row.ms).sort((a, b) => a - b)[Math.floor(mine.length / 2)] : null };
});
writeFileSync(join(out, 'results.json'), JSON.stringify({ when: new Date().toISOString(), summary, rows, spentUsd: Number(spent.toFixed(5)), stopped }, null, 2));
console.log(JSON.stringify({ summary, spentUsd: Number(spent.toFixed(5)), stopped }, null, 2));
