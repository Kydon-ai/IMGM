import path from "path";
import { execFileSync } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

export type TransformersProxy = {
  source: "环境变量代理" | "Windows 用户代理";
  endpoint: string;
  close: () => Promise<void>;
};

/** 获取项目内 Transformers.js 模型缓存目录。 */
export function getTransformersCacheDir(): string {
  return path.resolve(process.env.IMAGE_MODEL_CACHE_DIR || path.join(process.cwd(), "data", "models"));
}

/** 配置 Transformers.js 使用指定的本地缓存，并控制是否允许联网补齐模型。 */
export function configureTransformersEnv(transformersEnv: any, allowRemoteModels: boolean): void {
  transformersEnv.cacheDir = getTransformersCacheDir();
  transformersEnv.allowLocalModels = true;
  transformersEnv.allowRemoteModels = allowRemoteModels;
}

/** 配置 Node fetch 使用显式代理；Windows 下也读取浏览器使用的当前用户 Internet Settings 代理。 */
export function configureTransformersProxy(): TransformersProxy | undefined {
  const environmentProxy =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY;

  if (environmentProxy) {
    const agent = new EnvHttpProxyAgent();
    setGlobalDispatcher(agent);
    return {
      source: "环境变量代理",
      endpoint: describeProxy(environmentProxy),
      close: () => agent.close(),
    };
  }

  if (process.platform !== "win32") {
    return undefined;
  }

  const windowsProxy = getWindowsInternetSettingsProxy();
  if (!windowsProxy) {
    return undefined;
  }

  const agent = new EnvHttpProxyAgent({ httpProxy: windowsProxy, httpsProxy: windowsProxy });
  setGlobalDispatcher(agent);
  return {
    source: "Windows 用户代理",
    endpoint: describeProxy(windowsProxy),
    close: () => agent.close(),
  };
}

function getWindowsInternetSettingsProxy(): string | undefined {
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

  try {
    const enableOutput = execFileSync("reg.exe", ["query", key, "/v", "ProxyEnable"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!/\b0x0*1\b/i.test(enableOutput)) {
      return undefined;
    }

    const proxyOutput = execFileSync("reg.exe", ["query", key, "/v", "ProxyServer"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const rawProxy = proxyOutput.match(/\bProxyServer\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim();
    if (!rawProxy) {
      return undefined;
    }

    const entries = new Map<string, string>();
    for (const part of rawProxy.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) {
        entries.set("default", part.trim());
      } else {
        entries.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim());
      }
    }

    const proxy = entries.get("https") || entries.get("http") || entries.get("default");
    return proxy ? normalizeProxyUrl(proxy) : undefined;
  } catch {
    // Proxy settings are optional; direct networking remains the fallback.
    return undefined;
  }
}

function normalizeProxyUrl(proxy: string): string | undefined {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(proxy) ? proxy : `http://${proxy}`);
    if (!["http:", "https:", "socks:", "socks5:"].includes(url.protocol)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function describeProxy(proxy: string): string {
  try {
    const url = new URL(proxy);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `${url.hostname}:${port}`;
  } catch {
    return "configured proxy";
  }
}
