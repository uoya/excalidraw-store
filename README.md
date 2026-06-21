# Excalidraw Store

The server that stores the encrypted, shareable drawings from
[Excalidraw](https://excalidraw.com) on any S3-compatible object storage
(AWS S3, [RustFS](https://rustfs.com), MinIO, …).

## Development

Requires Node.js 22+ (TypeScript runs directly via Node's native type
stripping — no build step).

```
npm install
cp .env.example .env   # then edit to match your storage
npm run dev            # watch mode
npm start              # run once
npm run lint           # oxlint
npm run typecheck      # tsc --noEmit
```

### Local storage with RustFS

Run a local [RustFS](https://rustfs.com) instance, point `.env` at it
(`S3_ENDPOINT=http://localhost:9000`) and create the bucket named in
`S3_BUCKET`.

### Configuration

All configuration comes from environment variables (see `.env.example`).
The server refuses to start and prints the missing names if any are absent:

| Variable               | Description                                |
| ---------------------- | ------------------------------------------ |
| `S3_ENDPOINT`          | S3-compatible endpoint URL                 |
| `S3_REGION`            | Region (any value for non-AWS backends)    |
| `S3_BUCKET`            | Bucket name                                |
| `S3_ACCESS_KEY_ID`     | Access key                                 |
| `S3_SECRET_ACCESS_KEY` | Secret key                                 |
| `ALLOW_ORIGINS`        | Comma-separated origins allowed to POST    |
| `PORT`                 | Listen port (optional, defaults to `8080`) |

## Protocol

### POST

Example endpoint URL

```
https://json.excalidraw.com/api/v2/post/
```

#### Binary payload

```
1234567890
```

#### Response

```
{
  "id": "5633286537740288",
  "data": "https://json.excalidraw.com/api/v2/5633286537740288"
}
```

### GET

Example endpoint URL

```
https://json.excalidraw.com/api/v2/5633286537740288
```

#### Response

The binary data for the id, or `404` if it does not exist.

```
1234567890
```
