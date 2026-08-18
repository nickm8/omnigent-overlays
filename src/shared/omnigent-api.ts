
export type HeaderMap = Record<string, string>;

/**
 * A multi-user server needs the identity forwarded; a local single-user
 * server authenticates with its session cookie alone.
 */
export async function identityRequestHeaders(): Promise<HeaderMap> {
  try {
    const response = await window.fetch("/v1/me", { credentials: "same-origin" });
    if (!response.ok) return {};

    const identity: unknown = await response.json();
    const userId =
      identity && typeof identity === "object" && "user_id" in identity ? identity.user_id : null;
    if (typeof userId === "string" && userId !== "local") {
      return { "X-Forwarded-Email": userId };
    }
  } catch {
  }
  return {};
}

export async function apiErrorMessage(response: Response, operation: string): Promise<string> {
  const text = await response.text();
  return `${operation} failed: ${text || `${response.status} ${response.statusText}`}`;
}

export function terminalAttachUrl(conversationId: string, terminalId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return (
    `${protocol}//${window.location.host}/v1/sessions/${encodeURIComponent(conversationId)}` +
    `/resources/terminals/${encodeURIComponent(terminalId)}/attach`
  );
}

/** Open the terminal socket, send one command, and close. */
export function sendCommandToTerminal(
  conversationId: string,
  terminalId: string,
  command: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(terminalAttachUrl(conversationId, terminalId));
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("Timed out connecting to the shell."));
    }, 10_000);

    socket.addEventListener(
      "open",
      () => {
        window.clearTimeout(timeout);
        socket.send(new TextEncoder().encode(command));
        window.setTimeout(() => socket.close(), 100);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not connect to the shell."));
      },
      { once: true },
    );
  });
}

/**
 * Create (or reuse, per session_key) a terminal resource scoped to the
 * conversation's workspace and return its id.
 */
export async function createTerminalResource(
  conversationId: string,
  sessionKey: string,
): Promise<string> {
  const headers = await identityRequestHeaders();
  const agentResponse = await window.fetch(`/v1/sessions/${encodeURIComponent(conversationId)}/agent`, {
    credentials: "same-origin",
    headers,
  });
  if (!agentResponse.ok) throw new Error(await apiErrorMessage(agentResponse, "Reading shell options"));

  const agent: unknown = await agentResponse.json();
  const declared =
    agent && typeof agent === "object" && "terminals" in agent && Array.isArray(agent.terminals)
      ? agent.terminals
      : [];
  const terminals = declared.filter(
    (terminal): terminal is string => typeof terminal === "string" && terminal !== "",
  );
  const terminal = terminals.includes("shell") ? "shell" : terminals[0];
  if (!terminal) throw new Error("This conversation does not allow shells.");

  const terminalResponse = await window.fetch(
    `/v1/sessions/${encodeURIComponent(conversationId)}/resources/terminals`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ terminal, session_key: sessionKey }),
    },
  );
  if (!terminalResponse.ok) throw new Error(await apiErrorMessage(terminalResponse, "Starting shell"));

  const resource: unknown = await terminalResponse.json();
  const id = resource && typeof resource === "object" && "id" in resource ? resource.id : null;
  if (typeof id !== "string" || id === "") {
    throw new Error("The shell did not return a terminal id.");
  }
  return id;
}

/** Decode a terminal message frame (string, Blob, or ArrayBuffer) to text. */
export async function terminalMessageText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return "";
}
