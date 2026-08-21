// Port of generate_npmrc from helpers.sh. Values come from SSM-backed
// env vars where the literal string "null" (or empty/unset) means unset.

export interface NpmrcResult {
  // Text to append to ~/.npmrc (always at least the registry line).
  npmrc: string;
  // Diagnostics to print to the console. NOTE: bash wrote these into
  // ~/.npmrc itself (output of generate_npmrc was redirected); printing
  // to the console instead is a deliberate fix.
  diagnostics: string[];
}

function val(env: NodeJS.ProcessEnv, name: string): string | null {
  const v = env[name];
  if (v === undefined || v === '' || v === 'null') {
    return null;
  }
  return v;
}

export function generateNpmrc(env: NodeJS.ProcessEnv): NpmrcResult {
  const lines: string[] = [];
  const diagnostics: string[] = [];

  const artifactoryAuth = val(env, 'ARTIFACTORY_AUTH');
  const artifactoryEmail = val(env, 'ARTIFACTORY_EMAIL');
  if (artifactoryAuth && artifactoryEmail) {
    lines.push(
      `_auth=${artifactoryAuth}`,
      `email=${artifactoryEmail}`,
      'always-auth=true'
    );
  } else if (artifactoryAuth || artifactoryEmail) {
    diagnostics.push(
      'Both ARTIFACTORY_AUTH and ARTIFACTORY_EMAIL must be set for Artifactory auth to work'
    );
  }

  const registry = val(env, 'NPM_REGISTRY') ?? 'https://registry.npmjs.org/';
  lines.push(`registry=${registry}`);

  const token = val(env, 'NPM_TOKEN');
  if (token) {
    // Strip the scheme, keep the leading `//`. Bash only stripped
    // `https:` (broken for http registries) — fixed here.
    const registryBase = registry.replace(/^https?:/, '');
    lines.push(`${registryBase}:_authToken=${token}`);
  }

  const scope = val(env, 'NPM_SCOPE');
  if (scope) {
    const scopeRegistry = val(env, 'NPM_SCOPE_REGISTRY') ?? registry;
    lines.push(`${scope}:registry=${scopeRegistry}`);
  }

  // Any extra bits from the user, appended verbatim:
  const extra = val(env, 'NPMRC');
  if (extra) {
    lines.push(extra);
  }

  return { npmrc: `${lines.join('\n')}\n`, diagnostics };
}
