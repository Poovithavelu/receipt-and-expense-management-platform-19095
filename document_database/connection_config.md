# MongoDB Connection Configuration for Backend

Backends should use environment variables to connect to MongoDB. Do not hardcode credentials.

Required environment variables:
- MONGODB_URL
- MONGODB_DB

Java (Spring Boot) example:

- application.yml
  spring:
    data:
      mongodb:
        uri: ${MONGODB_URL}
        database: ${MONGODB_DB}

- Or application.properties
  spring.data.mongodb.uri=${MONGODB_URL}
  spring.data.mongodb.database=${MONGODB_DB}

Ensure your deployment environment provides these variables. For local development, you can source the ones created by startup.sh or copy from .env.example (do not commit real secrets).

Optional notes:
- For GridFS usage (storing binaries), use the default bucket "fs". The init script ensures required indexes for fs.files and fs.chunks.
- Prefer referencing stored files by GridFS fileId in receipts.storage.gridFs.fileId.
