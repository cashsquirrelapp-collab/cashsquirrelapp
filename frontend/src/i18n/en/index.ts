// English for every Thai sentence shown through tr() (see i18n/tr.ts), keyed by the Thai text.
// Split by area so each file stays readable; tests/i18n-coverage.test.ts checks that every tr() and
// T() text in the app has an entry here. Later files win when two areas share a sentence, so the
// shared wording lives in common.ts, which is spread last.
import { admin } from './admin';
import { assistant } from './assistant';
import { app } from './app';
import { auth } from './auth';
import { billing } from './billing';
import { calendar } from './calendar';
import { common } from './common';
import { data } from './data';
import { extra } from './extra';
import { server } from './server';
import { importing } from './importing';
import { components } from './components';
import { dashboard } from './dashboard';
import { expenses } from './expenses';
import { goals } from './goals';
import { invoices } from './invoices';
import { jobs } from './jobs';
import { landing } from './landing';
import { misc } from './misc';
import { mobile } from './mobile';
import { onboarding } from './onboarding';
import { receivables } from './receivables';
import { report } from './report';
import { settings } from './settings';
import { tax } from './tax';
import { vault } from './vault';

export const EN: Record<string, string> = {
  ...admin,
  ...assistant,
  ...app,
  ...auth,
  ...billing,
  ...calendar,
  ...components,
  ...dashboard,
  ...expenses,
  ...goals,
  ...invoices,
  ...jobs,
  ...landing,
  ...misc,
  ...mobile,
  ...onboarding,
  ...receivables,
  ...report,
  ...settings,
  ...tax,
  ...vault,
  ...extra,
  ...server,
  ...importing,
  ...data,
  ...common,
};
