const fs = require('fs');
const path = require('path');

const packagesDir = '../../../packages';
const commitSha = process.env.COMMIT_SHA;

const getNewVersion = (version) => {
  if (!commitSha || commitSha == 'null') {
    return version;
  }

  const shortSha = commitSha.slice(0, 7);
  return `${version}-${shortSha}`;
};

let versionMapping = {};

/**
 * This script iterates through every folder in ./packages and replaces their package.version with VERSION-COMMIT_SHA.
 * It then replaces the versions of all dependencies that are in this repo with the new VERSION-COMMIT_SHA of the corresponding package.
 * It is only used by the npm-publish-all-packages-canary.yml script, for the purposes of releasing a canary version of every package scoped to the latest commit to main.
 */
const updatePackageVersions = () => {
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
    if (!process.env.REPLACE_MAIN_VERSION_ONLY) {
      updateDependencies(pkg);
    }
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

      console.log(
        `Updated dependency ${packageNameToReplace} in ${pkg.content.name} to ${dependencies[packageNameToReplace]}`
      );
    }
  }
};

const saveUpdatedPackage = (pkg) => {
  fs.writeFileSync(pkg.path, JSON.stringify(pkg.content, null, 2));
};

updatePackageVersions();
