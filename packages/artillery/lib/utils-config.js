const fs = require('fs');
const os = require('os');

const configFilePath = `${os.homedir()}/.artilleryrc`;

function readArtilleryConfig() {
  try {
    const config = fs.readFileSync(configFilePath, 'utf-8');

    return JSON.parse(config);
  } catch (err) {
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
