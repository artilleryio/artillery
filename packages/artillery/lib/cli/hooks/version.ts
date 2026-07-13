
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

import banner from '../banner.ts';

const version = require('artillery/package.json').version;

async function versionHook() {
  if (['-v', '-V', '--version', 'version'].includes(process.argv[2])) {
    console.log(banner);

    console.log(`
VERSION INFO:

Artillery: ${version}
Node.js:   ${process.version}
OS:        ${process.platform}
`);

    return process.exit(0);
  }
}

export default versionHook;
