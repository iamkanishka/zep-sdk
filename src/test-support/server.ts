import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ZepClient } from "../client.js";

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface TestServer {
  client: ZepClient;
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Starts a real `node:http` server with the given handler and returns a
 * {@link ZepClient} pointed at it, so resource methods can be tested
 * against genuine HTTP request/response cycles - no mocking library.
 */
export async function startTestServer(handler: Handler): Promise<TestServer> {
  const server: Server = createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${String(port)}`;

  const client = new ZepClient({ apiKey: "z_test_key", baseUrl });

  return {
    client,
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

/** Reads and JSON-parses the full request body. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
}

/** Writes a JSON response with the correct content-type header. */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
}

/** Parses the request URL's query string into a plain object. */
export function query(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url ?? "/", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

/** Returns the request pathname without query string. */
export function pathname(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}
