const fs = require('fs');
const path = require('path');

const packagesDir = '../../../packages';
const commitSha = process.env.COMMIT_SHA;

const getNewVersion = (version) => `${version}-${commitSha}`;

let versionMapping = {};

const updatePackageVersions = () => {
  //checks all folders in packages folder by default
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

    packageJson.version = getNewVersion(packageJson.version);

    versionMapping[packageJson.name] = {
      content: packageJson,
      path: packageJsonFullPath
    };
  });

  for (const pkg of Object.values(versionMapping)) {
    updateDependencies(pkg);
    saveUpdatedPackage(pkg);
  }
};

const updateDependencies = (pkg) => {
  const {
    content: { dependencies }
  } = pkg;

  for (const packageNameToReplace of Object.keys(versionMapping)) {
    if (dependencies && dependencies[packageNameToReplace]) {
      //replace the dependency we care about in this package with its corrected canary version
      dependencies[packageNameToReplace] =
        versionMapping[packageNameToReplace].content.version;
    }
  }
};

const saveUpdatedPackage = (pkg) => {
  fs.writeFileSync(pkg.path, JSON.stringify(pkg.content, null, 2));
};

updatePackageVersions();
