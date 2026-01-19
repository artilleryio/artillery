const fs = require('node:fs');
const os = require('node:os');

const configFilePath = `${os.homedir()}/.artilleryrc`;

function readArtilleryConfig() {
  try {
    const config = fs.readFileSync(configFilePath, 'utf-8');

    return JSON.parse(config);
  } catch (_err) {
    return {};
  }
}

function updateArtilleryConfig(data) {
  try {
    const updatedConf = {
      ...readArtilleryConfig(),
      ...data
    };

    fs.writeFileSync(configFilePath, JSON.stringify(updatedConf));

    return updatedConf;
  } catch (err) {
    console.error(err);
  }
}

module.exports = { readArtilleryConfig, updateArtilleryConfig };
