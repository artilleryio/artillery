// Ambient declarations for globals used across the monorepo.
// The `artillery` global object is set up by @artilleryio/int-core
// (updateGlobalObject) and used by the CLI, engines and plugins.
declare global {
  // eslint-disable-next-line no-var
  var artillery: any;
}

export {};
