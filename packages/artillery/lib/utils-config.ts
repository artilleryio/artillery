import fs from 'node:fs';
import os from 'node:os';

const configFilePath = `${os.homedir()}/.artilleryrc`;

function readArtilleryConfig(): Record<string, unknown> {
  try {
    const config = fs.readFileSync(configFilePath, 'utf-8');

    return JSON.parse(config);
  } catch (_err) {
    return {};
  }
}

function updateArtilleryConfig(
  data: Record<string, unknown>
): Record<string, unknown> | undefined {
  try {
    const updatedConf = {
      ...readArtilleryConfig(),
      ...data
    };

    fs.writeFileSync(configFilePath, JSON.stringify(updatedConf));

    return updatedConf;
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

export { readArtilleryConfig, updateArtilleryConfig };
