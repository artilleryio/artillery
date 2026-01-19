module.exports.getAllPluginNames = function () {
  return [...this.getOfficialPlugins(), ...this.getProPlugins()];
};

module.exports.getOfficialPlugins = () => [
    'ensure',
    'expect',
    'metrics-by-endpoint',
    'publish-metrics',
    'apdex',
    'slack'
  ];

module.exports.getOfficialEngines = () => ['playwright'];

module.exports.getProPlugins = () => ['http-ssl-auth', 'http-file-uploads', 'sqs-reporter'];
