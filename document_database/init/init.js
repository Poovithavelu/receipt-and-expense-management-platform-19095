/**
 * MongoDB initialization script for the Receipt and Expense Management Platform.
 * Creates collections, JSON schema validators, and indexes for efficient queries.
 *
 * Usage:
 *  mongosh mongodb://appuser:dbuser123@localhost:5000/myapp?authSource=admin --file init.js
 */

/* PUBLIC_INTERFACE */
/**
 * bootstrapDatabase
 * Initializes collections, validators, and indexes if they don't exist.
 * This function is idempotent and safe to re-run.
 */
function bootstrapDatabase() {
  const DB_NAME = db.getName();

  // Utility to create collection with validator if not exists
  function ensureCollection(name, options = {}) {
    const exists = db.getCollectionNames().includes(name);
    if (!exists) {
      db.createCollection(name, options);
      print(`✓ Created collection: ${name}`);
    } else if (options.validator) {
      // Try to apply/update validation rules; ignore if not supported in environment
      try {
        db.runCommand({
          collMod: name,
          validator: options.validator,
          validationLevel: options.validationLevel || "moderate",
          validationAction: options.validationAction || "warn",
        });
        print(`✓ Updated validator for: ${name}`);
      } catch (e) {
        print(`! Skipped validator update for ${name}: ${e.message}`);
      }
    } else {
      print(`• Collection exists: ${name}`);
    }
  }

  // JSON Schema validators
  const userSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "role", "status", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        email: { bsonType: "string", description: "Unique user email" },
        username: { bsonType: ["string", "null"] },
        role: { enum: ["USER", "ADMIN", "MANAGER"] },
        status: { enum: ["ACTIVE", "INVITED", "DISABLED"] },
        profile: {
          bsonType: "object",
          properties: {
            firstName: { bsonType: ["string", "null"] },
            lastName: { bsonType: ["string", "null"] },
            locale: { bsonType: ["string", "null"] },
            timezone: { bsonType: ["string", "null"] },
          },
          additionalProperties: true,
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: ["date", "null"] },
      },
      additionalProperties: true,
    },
  };

  const documentsSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "title", "status", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        title: { bsonType: "string" },
        description: { bsonType: ["string", "null"] },
        tags: { bsonType: "array", items: { bsonType: "string" } },
        status: { enum: ["UPLOADED", "PROCESSING", "READY", "FAILED", "ARCHIVED"] },
        categoryId: { bsonType: ["objectId", "null"] },
        latestVersionId: { bsonType: ["objectId", "null"] },
        vendor: { bsonType: ["string", "null"] }, // e.g., store name
        currency: { bsonType: ["string", "null"] }, // ISO 4217
        totalAmount: { bsonType: ["double", "decimal", "int", "long", "null"] },
        metadata: { bsonType: "object", additionalProperties: true },
        notes: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: ["date", "null"] },
      },
      additionalProperties: true,
    },
  };

  const versionsSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["documentId", "version", "status", "createdAt", "sources"],
      properties: {
        _id: { bsonType: "objectId" },
        documentId: { bsonType: "objectId" },
        version: { bsonType: "int", minimum: 1 },
        status: { enum: ["UPLOADED", "OCR_QUEUED", "OCR_RUNNING", "OCR_DONE", "EXTRACTED", "FAILED"] },
        sources: {
          bsonType: "object",
          required: ["files"],
          properties: {
            files: {
              bsonType: "array",
              items: {
                bsonType: "object",
                required: ["path", "mimeType"],
                properties: {
                  storage: { enum: ["local", "s3", "gcs", "azure", "gridfs"], description: "storage backend" },
                  path: { bsonType: "string" },
                  mimeType: { bsonType: "string" },
                  sizeBytes: { bsonType: ["int", "long", "null"] },
                  checksum: { bsonType: ["string", "null"] },
                },
                additionalProperties: true,
              },
            },
            sourceType: { enum: ["UPLOAD", "EMAIL", "API", "MOBILE"], description: "ingestion source" },
          },
          additionalProperties: true,
        },
        ocr: {
          bsonType: "object",
          properties: {
            engine: { bsonType: ["string", "null"] },
            language: { bsonType: ["string", "null"] },
            ocrFullText: { bsonType: ["string", "null"] },
            confidence: { bsonType: ["double", "decimal", "int", "long", "null"] },
            pages: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  number: { bsonType: ["int", "long"] },
                  text: { bsonType: ["string", "null"] },
                  confidence: { bsonType: ["double", "decimal", "int", "long", "null"] },
                },
                additionalProperties: true,
              },
            },
          },
          additionalProperties: true,
        },
        extraction: {
          bsonType: "object",
          properties: {
            fields: {
              bsonType: "array",
              items: {
                bsonType: "object",
                required: ["key", "value"],
                properties: {
                  key: { bsonType: "string" },
                  value: {},
                  normalizedValue: {},
                  confidence: { bsonType: ["double", "decimal", "int", "long", "null"] },
                  page: { bsonType: ["int", "long", "null"] },
                },
                additionalProperties: true,
              },
            },
            vendor: { bsonType: ["string", "null"] },
            invoiceNumber: { bsonType: ["string", "null"] },
            date: { bsonType: ["date", "null"] },
            currency: { bsonType: ["string", "null"] },
            total: { bsonType: ["double", "decimal", "int", "long", "null"] },
            taxes: {
              bsonType: "array",
              items: {
                bsonType: "object",
                properties: {
                  type: { bsonType: ["string", "null"] },
                  amount: { bsonType: ["double", "decimal", "int", "long", "null"] },
                },
                additionalProperties: true,
              },
            },
          },
          additionalProperties: true,
        },
        categorization: {
          bsonType: "object",
          properties: {
            categoryId: { bsonType: ["objectId", "null"] },
            label: { bsonType: ["string", "null"] },
            confidence: { bsonType: ["double", "decimal", "int", "long", "null"] },
            rulesMatched: { bsonType: "array", items: { bsonType: "string" } },
          },
          additionalProperties: true,
        },
        processing: {
          bsonType: "object",
          properties: {
            startedAt: { bsonType: ["date", "null"] },
            completedAt: { bsonType: ["date", "null"] },
            error: {
              bsonType: ["object", "null"],
              properties: {
                code: { bsonType: ["string", "null"] },
                message: { bsonType: ["string", "null"] },
              },
              additionalProperties: true,
            },
          },
          additionalProperties: true,
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: ["date", "null"] },
      },
      additionalProperties: true,
    },
  };

  const extractedFieldsSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["versionId", "key", "value", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        versionId: { bsonType: "objectId" },
        documentId: { bsonType: ["objectId", "null"] },
        key: { bsonType: "string" },
        value: {}, // mixed type
        normalizedValue: {},
        type: { enum: ["string", "number", "date", "boolean", "object", "array", null] },
        confidence: { bsonType: ["double", "decimal", "int", "long", "null"] },
        createdAt: { bsonType: "date" },
      },
      additionalProperties: true,
    },
  };

  const categoriesSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["name", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        name: { bsonType: "string" },
        code: { bsonType: ["string", "null"] },
        description: { bsonType: ["string", "null"] },
        parentId: { bsonType: ["objectId", "null"] },
        color: { bsonType: ["string", "null"] },
        rules: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              field: { bsonType: "string" }, // e.g., "vendor" or "ocrFullText"
              op: {
                enum: ["eq", "neq", "contains", "regex", "gt", "gte", "lt", "lte", "in", "nin"],
              },
              value: {},
              weight: { bsonType: ["double", "decimal", "int", "long", "null"] },
            },
            additionalProperties: true,
          },
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: ["date", "null"] },
      },
      additionalProperties: true,
    },
  };

  const processingJobsSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["versionId", "type", "status", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        versionId: { bsonType: "objectId" },
        documentId: { bsonType: ["objectId", "null"] },
        type: { enum: ["OCR", "EXTRACTION", "CATEGORIZATION"] },
        status: { enum: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] },
        attempts: { bsonType: ["int", "long"], minimum: 0 },
        startedAt: { bsonType: ["date", "null"] },
        completedAt: { bsonType: ["date", "null"] },
        error: {
          bsonType: ["object", "null"],
          properties: {
            code: { bsonType: ["string", "null"] },
            message: { bsonType: ["string", "null"] },
          },
          additionalProperties: true,
        },
        createdAt: { bsonType: "date" },
      },
      additionalProperties: true,
    },
  };

  const auditLogsSchema = {
    $jsonSchema: {
      bsonType: "object",
      required: ["action", "createdAt"],
      properties: {
        _id: { bsonType: "objectId" },
        actorId: { bsonType: ["objectId", "null"] },
        action: { bsonType: "string" },
        entity: { bsonType: ["string", "null"] }, // e.g., "document", "version", "user"
        entityId: { bsonType: ["objectId", "null"] },
        meta: { bsonType: "object", additionalProperties: true },
        createdAt: { bsonType: "date" },
      },
      additionalProperties: true,
    },
  };

  // Ensure collections
  ensureCollection("users", { validator: userSchema });
  ensureCollection("documents", { validator: documentsSchema });
  ensureCollection("document_versions", { validator: versionsSchema });
  ensureCollection("extracted_fields", { validator: extractedFieldsSchema });
  ensureCollection("expense_categories", { validator: categoriesSchema });
  ensureCollection("processing_jobs", { validator: processingJobsSchema });
  ensureCollection("audit_logs", { validator: auditLogsSchema });

  // Indexes

  // users
  db.users.createIndex({ email: 1 }, { unique: true, name: "ux_users_email" });
  db.users.createIndex({ username: 1 }, { unique: true, sparse: true, name: "ux_users_username" });
  db.users.createIndex({ status: 1 }, { name: "ix_users_status" });
  db.users.createIndex({ createdAt: -1 }, { name: "ix_users_createdAt" });

  // expense_categories
  db.expense_categories.createIndex({ name: 1 }, { unique: true, name: "ux_categories_name" });
  db.expense_categories.createIndex(
    { name: "text", description: "text" },
    { name: "tx_categories_search" }
  );
  db.expense_categories.createIndex({ parentId: 1 }, { name: "ix_categories_parentId" });

  // documents
  db.documents.createIndex({ userId: 1, createdAt: -1 }, { name: "ix_docs_user_created" });
  db.documents.createIndex({ status: 1, createdAt: -1 }, { name: "ix_docs_status_created" });
  db.documents.createIndex({ categoryId: 1, createdAt: -1 }, { name: "ix_docs_category_created" });
  db.documents.createIndex({ latestVersionId: 1 }, { name: "ix_docs_latestVersionId" });
  db.documents.createIndex(
    { title: "text", notes: "text", tags: "text", vendor: "text" },
    { name: "tx_docs_search", default_language: "english" }
  );

  // document_versions
  db.document_versions.createIndex({ documentId: 1, version: -1 }, { unique: true, name: "ux_versions_document_version" });
  db.document_versions.createIndex({ status: 1, createdAt: -1 }, { name: "ix_versions_status_created" });
  db.document_versions.createIndex({ "categorization.categoryId": 1, createdAt: -1 }, { name: "ix_versions_category_created" });
  db.document_versions.createIndex({ "processing.startedAt": -1 }, { name: "ix_versions_processing_started" });
  db.document_versions.createIndex({ "processing.completedAt": -1 }, { name: "ix_versions_processing_completed" });
  db.document_versions.createIndex(
    { "extraction.vendor": 1, createdAt: -1 },
    { name: "ix_versions_vendor_created", sparse: true }
  );
  db.document_versions.createIndex(
    { "ocr.ocrFullText": "text", "extraction.vendor": "text" },
    { name: "tx_versions_ocr_vendor", default_language: "english" }
  );

  // extracted_fields
  db.extracted_fields.createIndex({ versionId: 1, key: 1 }, { name: "ix_fields_version_key" });
  db.extracted_fields.createIndex({ key: 1, normalizedValue: 1 }, { name: "ix_fields_key_normValue" });
  db.extracted_fields.createIndex({ documentId: 1 }, { name: "ix_fields_documentId" });

  // processing_jobs
  db.processing_jobs.createIndex({ versionId: 1, type: 1, createdAt: -1 }, { name: "ix_jobs_version_type" });
  db.processing_jobs.createIndex({ status: 1, createdAt: -1 }, { name: "ix_jobs_status_created" });

  // audit_logs
  db.audit_logs.createIndex({ actorId: 1, createdAt: -1 }, { name: "ix_audit_actor_created" });
  db.audit_logs.createIndex({ entity: 1, entityId: 1, createdAt: -1 }, { name: "ix_audit_entity_created" });

  // Seed base categories if none exist
  if (db.expense_categories.countDocuments({}) === 0) {
    const now = new Date();
    db.expense_categories.insertMany([
      { name: "Uncategorized", code: "UNCAT", description: "Default category", createdAt: now },
      { name: "Meals & Entertainment", code: "MEALS", createdAt: now },
      { name: "Travel", code: "TRAVEL", createdAt: now },
      { name: "Lodging", code: "LODGING", createdAt: now },
      { name: "Supplies", code: "SUPPLIES", createdAt: now },
      { name: "Utilities", code: "UTILITIES", createdAt: now },
      { name: "Software & Subscriptions", code: "SOFTWARE", createdAt: now },
      { name: "Transportation", code: "TRANSPORT", createdAt: now },
      { name: "Taxes & Fees", code: "TAXES", createdAt: now },
    ]);
    print("✓ Seeded base expense categories");
  }

  print(`Initialization complete for database: ${DB_NAME}`);
}

// Execute bootstrap
bootstrapDatabase();
