export function getAllPluginNames() {
  return [...getOfficialPlugins(), ...getProPlugins()];
}

export const getOfficialPlugins = () => [
  'ensure',
  'expect',
  'metrics-by-endpoint',
  'publish-metrics',
  'apdex',
  'slack',
  'fake-data'
];

export const getOfficialEngines = () => ['playwright'];

export const getProPlugins = () => [
  'http-ssl-auth',
  'http-file-uploads',
  'sqs-reporter'
];
