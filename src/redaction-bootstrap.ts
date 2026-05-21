// Side-effect import: installs console redaction before any other module
// can log secrets during initialisation. Must be imported immediately after
// 'dotenv/config' so env vars are loaded but nothing else has had a chance
// to emit output yet.
import { installConsoleRedaction } from './redaction';
installConsoleRedaction();
