/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

module.exports.Plugin = ArtilleryInspectScriptPlugin;

const { btoa } = require('../../util');

function ArtilleryInspectScriptPlugin(script, events) {
  this.script = script;
  this.events = events;

  const checksConfig = script.config?.ensure || script.config?.plugins?.ensure;

  if (checksConfig) {
    console.log(
      'inspect-script.config.ensure=' + btoa(JSON.stringify(checksConfig))
    );
  }

  return this;
}
ArtilleryInspectScriptPlugin.prototype.cleanup = function (done) {
  done(null);
};
