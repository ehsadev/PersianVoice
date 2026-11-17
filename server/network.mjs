import { setGlobalProxyFromEnv } from 'node:http';

// Apply after loading .env so both shell and project proxy settings work.
export function configureNetwork(env = process.env, configureProxy = setGlobalProxyFromEnv) {
  if (env.NODE_USE_ENV_PROXY === '0' || !(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy)) return;
  return configureProxy({
    ...env,
    ...(!(env.NO_PROXY || env.no_proxy) ? { NO_PROXY: 'localhost,127.0.0.1,::1' } : {}),
  });
}
