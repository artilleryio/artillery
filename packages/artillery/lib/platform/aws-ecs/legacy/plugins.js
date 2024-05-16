module.exports.getAllPluginNames = function () {
  return [...this.getOfficialPlugins(), ...this.getProPlugins()];
};

module.exports.getOfficialPlugins = function () {
  return [
    'ensure',
    'expect',
    'metrics-by-endpoint',
    'publish-metrics',
    'apdex',
    'slack'
  ];
};

module.exports.getOfficialEngines = function () {
  return ['playwright'];
};

module.exports.getProPlugins = function () {
  return ['http-ssl-auth', 'http-file-uploads', 'sqs-reporter'];
};
