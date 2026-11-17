import { describe, expect, it, vi } from 'vitest';
import { configureNetwork } from './network.mjs';

describe('server proxy configuration', () => {
  it('enables fetch proxy support after env loading and bypasses local connections by default', () => {
    const configure = vi.fn();
    configureNetwork({ HTTPS_PROXY: 'http://127.0.0.1:8080' }, configure);
    expect(configure).toHaveBeenCalledWith({ HTTPS_PROXY: 'http://127.0.0.1:8080', NO_PROXY: 'localhost,127.0.0.1,::1' });
  });
  it('preserves user bypass settings and respects explicit proxy opt-out', () => {
    const configure = vi.fn();
    configureNetwork({ https_proxy: 'http://proxy.example', no_proxy: '.example.com' }, configure);
    expect(configure).toHaveBeenCalledWith({ https_proxy: 'http://proxy.example', no_proxy: '.example.com' });
    configure.mockClear();
    configureNetwork({ HTTPS_PROXY: 'http://proxy.example', NODE_USE_ENV_PROXY: '0' }, configure);
    configureNetwork({}, configure);
    expect(configure).not.toHaveBeenCalled();
  });
});
