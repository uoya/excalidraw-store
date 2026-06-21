import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// All configuration comes from environment variables only.
const REQUIRED = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "ALLOW_ORIGINS",
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, ALLOW_ORIGINS } =
  process.env as Record<(typeof REQUIRED)[number], string>;

const allowOrigins = ALLOW_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const PORT = Number(process.env.PORT) || 8080;
const FILE_SIZE_LIMIT = 2 * 1024 * 1024;

// `forcePathStyle` lets us talk to any S3-compatible backend (RustFS, MinIO, …).
const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

const indexHtml = await readFile(new URL("./index.html", import.meta.url));
const favicon = await readFile(new URL("./favicon.ico", import.meta.url));

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const isAllowedOrigin = (origin: string | undefined): origin is string =>
  origin !== undefined && allowOrigins.some((allowed) => origin.includes(allowed));

const applyCors = (req: IncomingMessage, res: ServerResponse, path: string): void => {
  // Reads are public; writes are restricted to the allow-listed origins.
  if (path === "/api/v2/post/") {
    if (isAllowedOrigin(req.headers.origin)) {
      res.setHeader("access-control-allow-origin", req.headers.origin);
    }
  } else {
    res.setHeader("access-control-allow-origin", "*");
  }
};

const getObject = async (res: ServerResponse, key: string): Promise<void> => {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    res.writeHead(200, { "content-type": "application/octet-stream" });
    (object.Body as Readable).pipe(res);
  } catch (error) {
    console.error(error);
    json(res, 404, { message: "Could not find the file." });
  }
};

const putObject = (req: IncomingMessage, res: ServerResponse): void => {
  const chunks: Buffer[] = [];
  let size = 0;

  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > FILE_SIZE_LIMIT) {
      json(res, 413, { message: "Data is too large.", max_limit: FILE_SIZE_LIMIT });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", async () => {
    if (res.writableEnded) return;
    const id = randomUUID();
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: id,
          Body: Buffer.concat(chunks),
        }),
      );
      const proto = req.headers["x-forwarded-proto"] ?? "http";
      json(res, 200, {
        id,
        data: `${proto}://${req.headers.host}/api/v2/${id}`,
      });
    } catch (error) {
      console.error(error);
      json(res, 500, { message: "Could not upload the data." });
    }
  });
};

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  if (path.startsWith("/api/")) applyCors(req, res, path);

  if (method === "OPTIONS") {
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader(
      "access-control-allow-headers",
      req.headers["access-control-request-headers"] ?? "*",
    );
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "GET" && path === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(indexHtml);
    return;
  }

  if (method === "GET" && path === "/favicon.ico") {
    res.writeHead(200, { "content-type": "image/x-icon" });
    res.end(favicon);
    return;
  }

  if (method === "POST" && path === "/api/v2/post/") {
    putObject(req, res);
    return;
  }

  if (method === "GET" && path.startsWith("/api/v2/")) {
    const key = path.slice("/api/v2/".length);
    if (key) {
      void getObject(res, key);
      return;
    }
  }

  json(res, 404, { message: "Not found." });
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
