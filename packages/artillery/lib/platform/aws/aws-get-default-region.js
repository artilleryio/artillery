const {
  loadConfig,
  NODE_REGION_CONFIG_FILE_OPTIONS,
  NODE_REGION_CONFIG_OPTIONS
} = require('@smithy/core/config');
const debug = require('debug')('util:aws:get-default-region');

let defaultRegionAlreadyChecked = false;
let currentDefaultRegion = null;

module.exports = async function getDefaultRegion() {
  if (!defaultRegionAlreadyChecked) {
    try {
      currentDefaultRegion = await loadConfig(
        NODE_REGION_CONFIG_OPTIONS,
        NODE_REGION_CONFIG_FILE_OPTIONS
      )();
    } catch (err) {
      debug('default region check:', err);
    } finally {
      defaultRegionAlreadyChecked = true;
    }
  }

  return currentDefaultRegion;
};
