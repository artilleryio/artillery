const fs = require('node:fs');

const packageNames = [];
fs.readdirSync('packages').forEach((pkg) => {
  if (fs.statSync(`packages/${pkg}`).isDirectory()) {
    const pkgJson = fs.readFileSync(`packages/${pkg}/package.json`, 'utf8');
    packageNames.push(JSON.parse(pkgJson).name);
  }
});

console.log(JSON.stringify(packageNames));
