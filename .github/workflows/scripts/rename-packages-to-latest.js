const fs = require('fs');
const path = require('path');

const packageJsonRelativePath = `../../../packages/${process.env.PACKAGE_FOLDER_NAME}/package.json`;
const packageJsonFullPath = path.join(__dirname, packageJsonRelativePath);
let package;

if (!fs.existsSync(packageJsonFullPath)) {
  throw new Error(
    `Path ${packageJsonRelativePath} does not exist! Please ensure you pass the correct PACKAGE_FOLDER_NAME environment variable. Perhaps your folder name has changed?`
  );
} else {
  package = require(packageJsonRelativePath);
}

Object.keys(package.dependencies).forEach((key) => {
  if (package.dependencies[key] == '*') {
    package.dependencies[key] = 'latest';
  }
});

fs.writeFileSync(`${packageJsonFullPath}`, JSON.stringify(package, null, 2));
