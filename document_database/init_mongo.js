//
// MongoDB initialization script for receipt document platform
// - Creates collections
// - Applies JSON Schema validators (where supported)
// - Creates indexes
//
// Collections:
//   - receipts: uploaded documents, user reference, storage info, etc.
//   - ocr_results: OCR-extracted key fields linked to receipts
//   - document_versions: version history entries for receipts
//   - metadata: tagging, status, categorization, processing state
//
// Usage:
//   mongosh "<MONGODB_URL>/<DB_NAME>?authSource=admin" --eval "db.getName()"  # quick check
//   mongosh "<MONGODB_URL>/<DB_NAME>?authSource=admin" init_mongo.js
//

/**
 * Utility: create or update collection with schema and indexes idempotently.
 */
async function ensureCollection(db, name, validator, indexes = []) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name, validator ? { validator, validationLevel: "moderate" } : {});
    print(`✓ Created collection: ${name}`);
  } else {
    // Try to update validator where possible (MongoDB supports collMod on existing collections)
    if (validator) {
      try {
        await db.runCommand({ collMod: name, validator, validationLevel: "moderate" });
        print(`✓ Updated validator for: ${name}`);
      } catch (e) {
        print(`! Could not update validator for ${name}: ${e.message}`);
      }
    } else {
      print(`• Collection exists: ${name}`);
    }
  }

  // Create indexes
  const col = db.getCollection(name);
  for (const idx of indexes) {
    try {
      await col.createIndex(idx.keys, idx.options || {});
      print(`  ↳ Index ensured on ${name}: ${tojson(idx)}`);
    } catch (e) {
      print(`  ! Failed to create index on ${name}: ${e.message}`);
    }
  }
}

async function run() {
  const dbName = db.getName();
  print(`Initializing MongoDB database: ${dbName}`);

  // Common field patterns used across schemas
  const objectIdType = { bsonType: "objectId" };

  // receipts collection
  // Storing core info about each uploaded document; binaries are expected to be in GridFS or external object storage.
  const receiptsValidator = {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "fileName", "uploadDate", "storage", "status", "currentVersion"],
      properties: {
        userId: { bsonType: ["string", "objectId"], description: "User owner identifier" },
        organizationId: { bsonType: ["string", "objectId"], description: "Optional org/tenant id" },
        fileName: { bsonType: "string" },
        contentType: { bsonType: "string", description: "MIME type such as application/pdf, image/png" },
        sizeBytes: { bsonType: ["int", "long", "double"], description: "Original file size in bytes" },
        uploadDate: { bsonType: "date" },
        storage: {
          bsonType: "object",
          required: ["kind"],
          properties: {
            kind: { enum: ["gridfs", "external"], description: "Where the file content is stored" },
            gridFs: {
              bsonType: "object",
              properties: {
                bucket: { bsonType: "string", description: "GridFS bucket name" },
                fileId: objectIdType
              }
            },
            external: {
              bsonType: "object",
              properties: {
                provider: { bsonType: "string", description: "e.g., s3, gcs, filesystem" },
                url: { bsonType: "string" }
              }
            }
          }
        },
        status: { enum: ["uploaded", "processing", "processed", "error", "archived"] },
        error: {
          bsonType: "object",
          properties: {
            message: { bsonType: "string" },
            code: { bsonType: "string" },
            timestamp: { bsonType: "date" }
          }
        },
        currentVersion: { bsonType: "int", minimum: 1 },
        originalHash: { bsonType: "string", description: "Checksum/hash of the original file for dedup" },
        source: { bsonType: "string", description: "upload method e.g., user, email, api" },
        notes: { bsonType: "string" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      },
      additionalProperties: true
    }
  };

  const receiptsIndexes = [
    { keys: { userId: 1, uploadDate: -1 }, options: { name: "ix_user_uploadDate" } },
    { keys: { status: 1, uploadDate: -1 }, options: { name: "ix_status_uploadDate" } },
    { keys: { originalHash: 1 }, options: { name: "ux_originalHash", unique: false, sparse: true } },
    { keys: { "storage.gridFs.fileId": 1 }, options: { name: "ix_storage_gridfs_fileId", sparse: true } }
  ];

  await ensureCollection(db, "receipts", receiptsValidator, receiptsIndexes);

  // ocr_results collection
  // Each document represents OCR extracted fields for a given receipt and version.
  const ocrResultsValidator = {
    $jsonSchema: {
      bsonType: "object",
      required: ["receiptId", "version", "extractedAt", "fields"],
      properties: {
        receiptId: objectIdType,
        version: { bsonType: "int", minimum: 1 },
        extractedAt: { bsonType: "date" },
        engine: { bsonType: "string", description: "OCR engine used e.g., tesseract, textract, vision" },
        confidence: { bsonType: ["double", "int"], description: "Overall confidence score" },
        fields: {
          bsonType: "object",
          properties: {
            merchant: { bsonType: "string" },
            date: { bsonType: "date" },
            total: { bsonType: ["double", "int", "decimal"] },
            currency: { bsonType: "string" },
            tax: { bsonType: ["double", "int", "decimal"] },
            tip: { bsonType: ["double", "int", "decimal"] },
            category: { bsonType: "string" },
            lineItems: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  description: { bsonType: "string" },
                  quantity: { bsonType: ["double", "int"] },
                  unitPrice: { bsonType: ["double", "int", "decimal"] },
                  total: { bsonType: ["double", "int", "decimal"] },
                  tax: { bsonType: ["double", "int", "decimal"] }
                }
              }
            },
            rawText: { bsonType: "string" }
          },
          additionalProperties: true
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      },
      additionalProperties: true
    }
  };

  const ocrResultsIndexes = [
    { keys: { receiptId: 1, version: 1 }, options: { name: "ux_receipt_version", unique: true } },
    { keys: { "fields.merchant": 1, "fields.date": -1 }, options: { name: "ix_merchant_date", sparse: true } },
    { keys: { "fields.category": 1, "fields.total": -1 }, options: { name: "ix_category_total", sparse: true } },
    { keys: { extractedAt: -1 }, options: { name: "ix_extractedAt" } }
  ];

  await ensureCollection(db, "ocr_results", ocrResultsValidator, ocrResultsIndexes);

  // document_versions collection
  // Tracks each version of a document with transformation summary
  const documentVersionsValidator = {
    $jsonSchema: {
      bsonType: "object",
      required: ["receiptId", "version", "createdAt"],
      properties: {
        receiptId: objectIdType,
        version: { bsonType: "int", minimum: 1 },
        createdAt: { bsonType: "date" },
        createdBy: { bsonType: ["string", "objectId"] },
        changeType: { enum: ["upload", "ocr", "manual_edit", "auto_categorization", "reprocess"] },
        summary: { bsonType: "string" },
        diff: { bsonType: "object", description: "Optional difference summary between versions" },
        references: {
          bsonType: "object",
          properties: {
            ocrResultId: objectIdType,
            fileId: objectIdType,
            externalUrl: { bsonType: "string" }
          }
        },
        metadataSnapshot: { bsonType: "object", description: "Snapshot of relevant metadata at this version" }
      },
      additionalProperties: true
    }
  };

  const documentVersionsIndexes = [
    { keys: { receiptId: 1, version: -1 }, options: { name: "ix_receipt_version_desc" } },
    { keys: { createdAt: -1 }, options: { name: "ix_createdAt" } }
  ];

  await ensureCollection(db, "document_versions", documentVersionsValidator, documentVersionsIndexes);

  // metadata collection
  // Additional classification and tagging info per receipt (or per version if needed).
  const metadataValidator = {
    $jsonSchema: {
      bsonType: "object",
      required: ["receiptId"],
      properties: {
        receiptId: objectIdType,
        version: { bsonType: "int", description: "Optional version specificity for metadata" },
        tags: { bsonType: "array", items: { bsonType: "string" } },
        status: { enum: ["new", "in_review", "approved", "rejected", "archived"] },
        processingState: { enum: ["pending", "queued", "running", "completed", "failed"] },
        category: { bsonType: "string" },
        subcategory: { bsonType: "string" },
        projectCode: { bsonType: "string" },
        costCenter: { bsonType: "string" },
        custom: { bsonType: "object", description: "Flexible metadata map" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" }
      },
      additionalProperties: true
    }
  };

  const metadataIndexes = [
    { keys: { receiptId: 1, version: 1 }, options: { name: "ix_receipt_version", sparse: true } },
    { keys: { tags: 1 }, options: { name: "ix_tags", sparse: true } },
    { keys: { status: 1, processingState: 1 }, options: { name: "ix_status_processingState" } },
    { keys: { category: 1, subcategory: 1 }, options: { name: "ix_category_subcategory", sparse: true } },
    { keys: { updatedAt: -1 }, options: { name: "ix_updatedAt" } }
  ];

  await ensureCollection(db, "metadata", metadataValidator, metadataIndexes);

  // Optional: Create a GridFS bucket for receipts if using GridFS
  try {
    // This call will create the bucket collections if they don't exist
    await db.createCollection("fs.files");
    await db.createCollection("fs.chunks");
    // Ensure default GridFS indexes
    await db.getCollection("fs.files").createIndex({ filename: 1, uploadDate: -1 }, { name: "ix_filename_uploadDate" });
    await db.getCollection("fs.chunks").createIndex({ files_id: 1, n: 1 }, { unique: true, name: "ux_files_n" });
    print("✓ GridFS bucket ensured (fs.files, fs.chunks)");
  } catch (e) {
    if (e.codeName === "NamespaceExists") {
      print("• GridFS bucket already exists");
    } else {
      print(`! GridFS setup note: ${e.message}`);
    }
  }

  print("Initialization complete.");
}

await run();
