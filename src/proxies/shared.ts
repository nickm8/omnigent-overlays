
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type HttpProxy from "http-proxy-3";

export function rewriteBrowserUrl(
  value: string,
  browserOrigin: string,
  upstreamOrigin: string,
): string {
  try {
    const parsed = new URL(value);
    if (parsed.origin === browserOrigin) {
      return `${upstreamOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
  }
  return value;
}

export function upstreamHeaders(
  request: IncomingMessage,
  upstreamHost: string,
  browserOrigin: string,
  upstreamOrigin: string,
): { [header: string]: string } {
  const headers = { ...request.headers };
  headers.host = upstreamHost;
  headers["accept-encoding"] = "identity";
  if (typeof headers.origin === "string") {
    headers.origin = rewriteBrowserUrl(headers.origin, browserOrigin, upstreamOrigin);
  }
  if (typeof headers.referer === "string") {
    headers.referer = rewriteBrowserUrl(headers.referer, browserOrigin, upstreamOrigin);
  }
  return headers as { [header: string]: string };
}

export function isHtml(response: IncomingMessage): boolean {
  return (response.headers["content-type"] || "").toLowerCase().includes("text/html");
}

/**
 * Buffer the upstream response, apply `transform` to its UTF-8 body, and send
 * it with the length/validator headers corrected (plus any overrides).
 */
export function sendTransformedResponse(
  proxyResponse: IncomingMessage,
  response: ServerResponse,
  transform: (body: string) => string,
  headerOverrides: Record<string, string> = {},
): void {
  const chunks: Buffer[] = [];
  proxyResponse.on("data", (chunk: Buffer) => chunks.push(chunk));
  proxyResponse.on("error", () => response.destroy());
  proxyResponse.on("end", () => {
    const headers: Record<string, unknown> = { ...proxyResponse.headers };
    delete headers["content-length"];
    delete headers["content-encoding"];
    delete headers["etag"];
    delete headers["last-modified"];
    delete headers["transfer-encoding"];
    Object.assign(headers, headerOverrides);

    const body = Buffer.from(transform(Buffer.concat(chunks).toString("utf8")));
    headers["content-length"] = String(body.length);
    response.writeHead(proxyResponse.statusCode || 200, headers as Record<string, string>);
    response.end(body);
  });
}

export function installUpstreamErrorHandler(proxy: HttpProxy, message: string): void {
  proxy.on("error", (error: Error, _request: IncomingMessage, response: ServerResponse | Socket) => {
    console.error("Upstream proxy error:", error.message);
    if (response && "writeHead" in response && !response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end(message);
    } else {
      response?.destroy();
    }
  });
}

export function installShutdownHandlers(proxy: HttpProxy, server: Server): void {
  const shutdown = (): void => {
    proxy.close();
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 250).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Read a bounded request body; returns "" (and drops the request) if it
 * exceeds `limit`. The bound is enforced at the socket, BEFORE any
 * authorization runs, so an unauthenticated client cannot buffer an
 * arbitrarily large body into memory.
 */
export async function readBody(request: IncomingMessage, limit = 8192): Promise<string> {
  return new Promise((resolveBody) => {
    let data = "";
    let size = 0;
    let aborted = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        aborted = true;
        request.destroy();
        resolveBody("");
        return;
      }
      data += chunk.toString("utf8");
    });
    request.on("end", () => {
      if (!aborted) resolveBody(data);
    });
    request.on("error", () => resolveBody(""));
  });
}

/**
 * A mutation serializer: tasks run one at a time in submission order, so
 * concurrent control requests cannot interleave a read-modify-write of
 * state.json (lost update).
 */
export function createMutationSerializer(): <T>(task: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
