const banner = require('../banner');
const version = require('../../../package.json').version;

const tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

async function versionHook() {
  if (['-v', '-V', '--version', 'version'].includes(process.argv[2])) {
    console.log(banner);

    console.log(`
VERSION INFO:

Artillery Core: ${version}
Artillery Pro:  ${Pro ? Pro.version : 'not installed (https://artillery.io/product)'}

Node.js: ${process.version}
OS:      ${process.platform}
`);


    return process.exit(0);
  }
}

module.exports = versionHook;
