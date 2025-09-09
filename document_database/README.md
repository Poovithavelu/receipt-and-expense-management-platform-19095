# Document Database (MongoDB) Setup

This folder contains MongoDB initialization scripts and configuration for the Receipt and Expense Management Platform.

Contents:
- init/: JavaScript and JSON files to initialize the database collections, indexes, and seed data.
- startup.sh: Starts MongoDB and creates DB/users (already present).
- backup_db.sh and restore_db.sh: Generic DB backup/restore scripts (already present).
- db_visualizer/: Simple DB viewer (already present).

How to run initialization:
1) Ensure MongoDB is running (use the provided startup.sh if applicable).
2) Execute the initialization script:
   mongosh "$(cat db_connection.txt | sed 's/myapp/?authSource=admin/')" --file init/init.js
   Or directly (adjust creds/port/db if changed):
   mongosh mongodb://appuser:dbuser123@localhost:5000/myapp?authSource=admin --file init/init.js

Environment variables (used by other components):
- MONGODB_URL (e.g., mongodb://appuser:dbuser123@localhost:5000/?authSource=admin)
- MONGODB_DB  (e.g., myapp)

Data model overview:

Collections:
- users: Application users and profiles.
- documents: Top-level documents uploaded by users; one document can have multiple versions.
- document_versions: Individual processed versions (source image/file, OCR, extracted fields, statuses).
- extracted_fields: Optional denormalized key-value pairs per version for analytics/search.
- expense_categories: Managed list of categories and rules for auto-categorization.
- processing_jobs: Records/metadata for OCR/categorization runs and their statuses.
- audit_logs: System actions for traceability.

Key indexes:
- users: email unique; optional username unique.
- documents: userId, status, categoryId, createdAt; text index on title/notes/tags.
- document_versions: documentId, status, processing timestamps; text index on ocrFullText and vendor.
- extracted_fields: versionId, key, value; compound indexes for frequent queries.
- expense_categories: name unique; text index for search.
- processing_jobs: versionId/status.
- audit_logs: actorId, entityId, createdAt.

Notes:
- We keep versions in a separate collection to avoid large document growth and allow efficient querying.
- We store both raw OCR text and normalized extracted fields; the latter assists structured queries and aggregations.
- Where appropriate, we add partial indexes and TTLs (e.g., transient jobs) which can be enabled or tuned later.

Security:
- Do not hardcode secrets in application code. Use environment variables.
- This initialization does not enable MongoDB Atlas Search; it relies on standard indexes and text indexes.

