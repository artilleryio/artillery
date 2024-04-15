const fs = require('fs');
const path = require('path');

const updatePackageWithDependencies = (originalPackage) => {
  const packagesDir = '../../../packages';
  const finalPackage = { ...originalPackage };

  const packageFolders = fs
    .readdirSync(path.join(__dirname, packagesDir), { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  packageFolders.forEach((folder) => {
    const packageJsonRelativePath = `${packagesDir}/${folder}/package.json`;
    const packageJsonFullPath = path.join(__dirname, packageJsonRelativePath);

    if (!fs.existsSync(packageJsonFullPath)) {
      throw new Error(
        `Path ${packageJsonRelativePath} does not exist! Please ensure that it is a package!`
      );
    }

    const packageData = fs.readFileSync(packageJsonFullPath);
    const packageJson = JSON.parse(packageData);

    if (
      finalPackage.dependencies[packageJson.name] &&
      finalPackage.dependencies[packageJson.name] == '*'
    ) {
      console.log(
        `Switching package ${packageJson.name} in ${
          originalPackage.name
        } from ${finalPackage.dependencies[packageJson.name]} to version ${
          packageJson.version
        }`
      );
      finalPackage.dependencies[packageJson.name] = packageJson.version;
    }
  });

  return finalPackage;
};

for (const PACKAGE_FOLDER_NAME of process.env.PACKAGES_TO_REPLACE.split(',')) {
  const packageJsonRelativePath = `../../../packages/${PACKAGE_FOLDER_NAME}/package.json`;
  const packageJsonFullPath = path.join(__dirname, packageJsonRelativePath);

  if (!fs.existsSync(packageJsonFullPath)) {
    throw new Error(
      `Path ${packageJsonRelativePath} does not exist! Please ensure you pass the correct PACKAGE_FOLDER_NAME environment variable. Perhaps your folder name has changed?`
    );
  } else {
    artilleryPackage = require(packageJsonRelativePath);
  }

  const modifiedPackage = updatePackageWithDependencies(artilleryPackage);
  fs.writeFileSync(
    `${packageJsonFullPath}`,
    JSON.stringify(modifiedPackage, null, 2)
  );
}
