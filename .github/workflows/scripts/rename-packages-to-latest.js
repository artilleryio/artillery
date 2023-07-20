const fs = require('fs');
const packageJsonPath = '../../../packages/artillery/package.json';
const package = require(packageJsonPath);
const path = require('path');

Object.keys(package.dependencies).forEach((key) => {
  if (package.dependencies[key] == '*') {
    package.dependencies[key] = 'latest';
  }
});

fs.writeFileSync(
  `${path.join(__dirname, packageJsonPath)}`,
  JSON.stringify(package, null, 2)
);
