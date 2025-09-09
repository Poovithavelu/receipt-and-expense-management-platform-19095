# Document Database (MongoDB)

This container provides MongoDB setup for the Receipt and Expense Management Platform. It defines database collections, validators, and indexes for storing uploaded documents, OCR results, version history, and metadata.

What this provides:
- MongoDB initialization script to create the following collections:
  - receipts
  - ocr_results
  - document_versions
  - metadata
  - GridFS (fs.files, fs.chunks) for optional file storage
- Example environment configuration for backend integration
- Startup and backup/restore helpers

Note: This container does not implement application logic. It only sets up structure and access configuration.

## Collections

1) receipts
- Purpose: Core record for each uploaded document.
- Key fields:
  - userId, organizationId
  - fileName, contentType, sizeBytes, uploadDate
  - storage: { kind: "gridfs" | "external", gridFs: { bucket, fileId }, external: { provider, url } }
  - status: uploaded | processing | processed | error | archived
  - currentVersion (int)
  - originalHash (dedup)
  - createdAt, updatedAt
- Indexes: userId+uploadDate, status+uploadDate, originalHash, storage.gridFs.fileId

2) ocr_results
- Purpose: OCR extracted key fields for a (receiptId, version).
- Key fields:
  - receiptId (ObjectId)
  - version (int)
  - extractedAt (date)
  - engine, confidence
  - fields: merchant, date, total, currency, tax, tip, category, lineItems[], rawText
- Indexes: unique(receiptId, version), fields.merchant+fields.date, fields.category+fields.total, extractedAt

3) document_versions
- Purpose: Version history entries for each receipt.
- Key fields:
  - receiptId (ObjectId), version (int)
  - createdAt, createdBy
  - changeType: upload | ocr | manual_edit | auto_categorization | reprocess
  - summary, diff, references (ocrResultId, fileId, externalUrl)
- Indexes: receiptId+version(desc), createdAt

4) metadata
- Purpose: Tagging, status, categorization, processing state per receipt (optionally per version).
- Key fields:
  - receiptId (ObjectId), version (int optional)
  - tags[], status, processingState
  - category, subcategory
  - projectCode, costCenter, custom{}
- Indexes: receiptId+version, tags, status+processingState, category+subcategory, updatedAt

5) GridFS
- Collections: fs.files, fs.chunks
- Indexes: filename+uploadDate, unique(files_id, n)

## Initialization

To initialize the database schema:

- Ensure MongoDB is running. The provided startup.sh can bootstrap a local instance (if permitted in your environment). Otherwise, point to your managed MongoDB.

- Run the init script:
  mongosh "<MONGODB_URL>/<MONGODB_DB>?authSource=admin" init_mongo.js

The script is idempotent: it creates collections if missing and ensures indexes/validators.

## Backend Integration

Environment variables expected by dependent services (like the Spring Boot backend):

- MONGODB_URL
  Example: mongodb://appuser:dbuser123@localhost:5000/?authSource=admin

- MONGODB_DB
  Example: myapp

Connection examples:

- Java (Spring Boot, using MongoDB Java driver URI in application properties)
  spring.data.mongodb.uri=${MONGODB_URL}
  spring.data.mongodb.database=${MONGODB_DB}

- Node.js
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);

- CLI:
  mongosh "${MONGODB_URL}/${MONGODB_DB}?authSource=admin"

A helper db_connection.txt is also maintained by startup.sh for quick connect guidance.

## Scripts

- startup.sh
  Sets up a local MongoDB instance (if not already running), creates admin and app users, and writes connection info.

- init_mongo.js
  Applies collections, validators, and indexes. Safe to run multiple times.

- backup_db.sh / restore_db.sh
  Generic scripts to create or restore backups. For MongoDB, these use mongodump/mongorestore.

- db_visualizer/
  Small utility service to inspect the DB. Source the mongodb.env file to populate environment variables for it.

## Notes

- Binaries: For large files, prefer GridFS. This repo ensures fs.files and fs.chunks along with required indexes.
- Do not store secrets in source control. Use environment variables or secret managers.
- The provided credentials in scripts are placeholders for local use. In staged/prod environments, supply your own MONGODB_URL and MONGODB_DB via the orchestrator.
