
import {
  loadConfig,
  NODE_REGION_CONFIG_FILE_OPTIONS,
  NODE_REGION_CONFIG_OPTIONS
} from '@smithy/core/config';
import createDebug from 'debug';

const debug = createDebug('util:aws:get-default-region');

let defaultRegionAlreadyChecked = false;
let currentDefaultRegion = null;

export default async function getDefaultRegion() {
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
