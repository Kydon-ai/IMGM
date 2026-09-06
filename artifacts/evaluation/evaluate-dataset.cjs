"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { once } = require("node:events");

const evaluationRoot = __dirname;
const topK = 8;

function printUsage() {
  console.log([
    "Usage: npm run evaluate <dataset-name> [-- --limit <number>]",
    "",
    "Examples:",
    "  npm run evaluate imgm_mixed_500_v1",
    "  npm run evaluate imgm_mixed_500_v1 -- --limit 5",
  ].join("\n"));
}

function parseArguments(argv) {
  const args = [...argv];
  const datasetName = args.shift();
  let limit = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--limit") {
      limit = Number(args[index + 1]);
      index += 1;
    } else if (argument.startsWith("--limit=")) {
      limit = Number(argument.slice("--limit=".length));
    } else if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    } else if (/^\d+$/.test(argument) && limit === null) {
      // npm on Windows may strip the --limit option name and forward only its value.
      limit = Number(argument);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!datasetName) {
    printUsage();
    throw new Error("Missing dataset name.");
  }
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }

  return { datasetName, limit };
}

function normalizeDatasetName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readJsonLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findDatasetDirectory(requestedName) {
  const normalizedRequestedName = normalizeDatasetName(requestedName);
  const directories = fs
    .readdirSync(evaluationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  const matches = directories.filter(
    (entry) => normalizeDatasetName(entry.name) === normalizedRequestedName,
  );

  if (matches.length === 1) {
    return path.join(evaluationRoot, matches[0].name);
  }

  const available = directories.map((entry) => entry.name).join(", ") || "none";
  if (matches.length > 1) {
    throw new Error(`Dataset name is ambiguous: ${requestedName}. Matches: ${matches.map((entry) => entry.name).join(", ")}`);
  }
  throw new Error(`Dataset not found: ${requestedName}. Available datasets: ${available}`);
}

function normalizeAbsolutePath(value) {
  return path.resolve(value).replaceAll("\\", "/").toLowerCase();
}

function normalizeRelativePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function pathKeys(value) {
  if (!value) {
    return [];
  }
  return [normalizeAbsolutePath(value), normalizeRelativePath(value)];
}

function addPathIndex(index, value, record) {
  for (const key of pathKeys(value)) {
    index.set(key, record);
  }
}

function vectorToBuffer(vector) {
  return Buffer.from(new Float32Array(vector).buffer);
}

function deriveNameFromFilename(filename) {
  const basename = path.parse(filename).name;
  return basename.split("_").at(-1)?.trim() || basename;
}

function buildSearchableText(record) {
  const semantic = record.semantic || {};
  const fileName = record.fileName || path.basename(record.absolutePath || record.relativePath || "");
  const basename = path.parse(fileName).name;
  const parts = basename.split("_").map((part) => part.trim()).filter(Boolean);
  const semanticFilename = parts.length >= 6 && /^[a-f0-9]{8,}$/i.test(parts[0]);
  const source = semantic.source || (semanticFilename ? parts[1] : "");
  const subject = semantic.subject || (semanticFilename ? parts[2] : "");
  const action = semantic.action || (semanticFilename ? parts[3] : "");
  const emotion = semantic.emotion || (semanticFilename ? parts[4] : "");
  const description = semantic.description || (semanticFilename ? parts.slice(5).join(" ") : basename);
  return [
    `文件名:${fileName}`,
    source && `来源:${source}`,
    (record.label || record.sourceDirectory) && `类别:${record.label || record.sourceDirectory}`,
    subject && `主体:${subject}`,
    action && `动作:${action}`,
    emotion && `情绪:${emotion}`,
    description && `描述:${description}`,
  ].filter(Boolean).join(" ");
}

function createEvaluationDatabase(databasePath) {
  const Database = require("better-sqlite3");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.rmSync(databasePath, { force: true });
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE images (
      id INTEGER PRIMARY KEY,
      original_filename TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_path TEXT NOT NULL,
      embedding BLOB NOT NULL,
      image_embedding BLOB,
      name_embedding BLOB,
      searchable_text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_images_path ON images(image_path);
    CREATE INDEX idx_images_category ON images(category);
  `);
  return database;
}

async function rebuildEvaluationDatabase(dataset, databasePath, embedImage, embedTexts) {
  const missingImages = dataset.gallery
    .filter((record) => !record.absolutePath || !fs.existsSync(record.absolutePath))
    .map((record) => record.absolutePath || record.relativePath);
  if (missingImages.length > 0) {
    throw new Error(
      `Evaluation gallery contains ${missingImages.length} missing image files. First missing file: ${missingImages[0]}`,
    );
  }

  console.log(`Rebuilding evaluation database: ${databasePath}`);
  console.log(`Removing the previous evaluation database and indexing ${dataset.gallery.length} gallery images.`);
  const database = createEvaluationDatabase(databasePath);
  const names = dataset.gallery.map((record) => deriveNameFromFilename(record.fileName));
  const searchableTexts = dataset.gallery.map(buildSearchableText);
  const nameVectors = await embedTexts(searchableTexts);
  const imageVectors = [];

  try {
    for (const [index, record] of dataset.gallery.entries()) {
      if ((index + 1) % 25 === 0 || index === dataset.gallery.length - 1) {
        console.log(`[index ${index + 1}/${dataset.gallery.length}] ${record.fileName}`);
      }
      imageVectors.push(await embedImage(record.absolutePath));
    }

    const insert = database.prepare(`
      INSERT INTO images (
        original_filename,
        name,
        category,
        image_path,
        embedding,
        image_embedding,
        name_embedding,
        searchable_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const write = database.transaction(() => {
      for (const [index, record] of dataset.gallery.entries()) {
        const imageBuffer = vectorToBuffer(imageVectors[index] || []);
        const nameBuffer = vectorToBuffer(nameVectors[index] || []);
        insert.run(
          record.fileName,
          names[index] || record.fileName,
          record.label || record.sourceDirectory || "evaluation",
          record.absolutePath,
          imageBuffer,
          imageBuffer,
          nameBuffer,
          searchableTexts[index] || names[index] || record.fileName,
        );
      }
    });
    write();
  } finally {
    database.close();
  }

  return {
    databasePath,
    indexedImageCount: dataset.gallery.length,
    rebuilt: true,
  };
}

function loadEvaluationDataset(datasetDirectory) {
  const galleryPath = path.join(datasetDirectory, "gallery.jsonl");
  const queriesPath = path.join(datasetDirectory, "queries.jsonl");
  const summaryPath = path.join(datasetDirectory, "summary.json");
  for (const filePath of [galleryPath, queriesPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Dataset file not found: ${filePath}`);
    }
  }

  const gallery = readJsonLines(galleryPath);
  const queries = readJsonLines(queriesPath);
  const summary = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
    : null;
  const galleryById = new Map();
  const galleryByPath = new Map();

  for (const record of gallery) {
    if (!record.id || galleryById.has(record.id)) {
      throw new Error(`Gallery contains a missing or duplicate image id: ${record.id}`);
    }
    galleryById.set(record.id, record);
    addPathIndex(galleryByPath, record.absolutePath, record);
    addPathIndex(galleryByPath, record.relativePath, record);
  }

  const queryTexts = new Set();
  for (const query of queries) {
    if (!query.queryId || !query.query) {
      throw new Error("Every query must contain queryId and query.");
    }
    if (queryTexts.has(query.query)) {
      throw new Error(`Duplicate query text in dataset: ${query.query}`);
    }
    queryTexts.add(query.query);
    if (!Array.isArray(query.relevantImageIds) || query.relevantImageIds.length === 0) {
      throw new Error(`Query has no relevant images: ${query.queryId}`);
    }
    for (const imageId of query.relevantImageIds) {
      if (!galleryById.has(imageId)) {
        throw new Error(`Query ${query.queryId} references image id not found in gallery: ${imageId}`);
      }
    }
  }

  return { gallery, queries, summary, galleryById, galleryByPath };
}

function getMatchedGalleryRecord(hit, galleryByPath) {
  const candidates = [hit.filePath, hit.imagePath, hit.url]
    .filter(Boolean)
    .flatMap(pathKeys);
  return candidates.map((key) => galleryByPath.get(key)).find(Boolean) || null;
}

function serializeHit(hit, rank, galleryRecord, relevantIds) {
  const galleryImageId = galleryRecord?.id || null;
  return {
    rank,
    databaseId: hit.id,
    galleryImageId,
    fileName: hit.fileName,
    filePath: hit.filePath,
    score: hit.score,
    scores: hit.scores,
    matchedKeywords: hit.matchedKeywords,
    relevant: galleryImageId ? relevantIds.has(galleryImageId) : false,
  };
}

async function evaluateDataset(datasetDirectory, dataset, store, limit, databaseInfo) {
  const datasetName = path.basename(datasetDirectory);
  const startedAt = new Date();
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const logDirectory = path.join(datasetDirectory, "logs");
  await fsp.mkdir(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `evaluate-${runId}.jsonl`);
  const logStream = fs.createWriteStream(logPath, { encoding: "utf8" });
  const queries = limit ? dataset.queries.slice(0, limit) : dataset.queries;
  const results = [];

  const writeLog = async (record) => {
    if (!logStream.write(`${JSON.stringify(record)}\n`)) {
      await once(logStream, "drain");
    }
  };

  await writeLog({
    type: "run-start",
    runId,
    requestedDatasetName: datasetName,
    datasetDirectory: path.basename(path.dirname(logDirectory)),
    startedAt: startedAt.toISOString(),
    topK,
    queryCount: queries.length,
    galleryCount: dataset.gallery.length,
    database: databaseInfo,
  });

  try {
    for (const [index, query] of queries.entries()) {
      const queryStarted = Date.now();
      const relevantIds = new Set(query.relevantImageIds);
      const relevantRecords = query.relevantImageIds.map((imageId) => dataset.galleryById.get(imageId));
      try {
        const hits = await store.search(query.query, topK);
        const returned = hits.map((hit, hitIndex) =>
          serializeHit(hit, hitIndex + 1, getMatchedGalleryRecord(hit, dataset.galleryByPath), relevantIds),
        );
        const returnedRelevant = returned.filter((hit) => hit.relevant);
        const result = {
          type: "query-result",
          runId,
          index: index + 1,
          queryId: query.queryId,
          query: query.query,
          ratio: query.ratio || null,
          relevantCount: query.relevantImageIds.length,
          relevantImageIds: query.relevantImageIds,
          relevantPaths: query.relevantPaths || relevantRecords.map((record) => record.relativePath),
          topK,
          hitAt8: returnedRelevant.length > 0,
          firstHitRank: returnedRelevant[0]?.rank || null,
          returnedRelevantCount: returnedRelevant.length,
          recallAt8: returnedRelevant.length / query.relevantImageIds.length,
          returned,
          durationMs: Date.now() - queryStarted,
        };
        results.push(result);
        await writeLog(result);
        console.log(
          `[${index + 1}/${queries.length}] ${query.queryId} ${result.hitAt8 ? "HIT" : "MISS"} ` +
          `rank=${result.firstHitRank || "-"} ${result.durationMs}ms`,
        );
      } catch (error) {
        const result = {
          type: "query-error",
          runId,
          index: index + 1,
          queryId: query.queryId,
          query: query.query,
          ratio: query.ratio || null,
          relevantCount: query.relevantImageIds.length,
          relevantImageIds: query.relevantImageIds,
          relevantPaths: query.relevantPaths || relevantRecords.map((record) => record.relativePath),
          error: error instanceof Error ? error.stack || error.message : String(error),
          durationMs: Date.now() - queryStarted,
        };
        results.push(result);
        await writeLog(result);
        console.error(`[${index + 1}/${queries.length}] ${query.queryId} ERROR ${result.error}`);
      }
    }
  } finally {
    logStream.end();
    await once(logStream, "close");
  }

  const successfulResults = results.filter((result) => result.type === "query-result");
  const hitCount = successfulResults.filter((result) => result.hitAt8).length;
  const relevantCount = successfulResults.reduce((total, result) => total + result.relevantCount, 0);
  const returnedRelevantCount = successfulResults.reduce((total, result) => total + result.returnedRelevantCount, 0);
  const durationMs = Date.now() - startedAt.getTime();
  const summary = {
    formatVersion: 1,
    metric: "Hit@8",
    runId,
    requestedDatasetName: datasetName,
    datasetDirectory: path.basename(path.dirname(logDirectory)),
    generatedAt: new Date().toISOString(),
    topK,
    queryCount: queries.length,
    completedQueryCount: successfulResults.length,
    errorCount: results.length - successfulResults.length,
    galleryCount: dataset.gallery.length,
    database: databaseInfo,
    hitCount,
    missCount: successfulResults.length - hitCount,
    hitAt8: successfulResults.length ? hitCount / successfulResults.length : 0,
    relevantCount,
    returnedRelevantCount,
    recallAt8: relevantCount ? returnedRelevantCount / relevantCount : 0,
    averageQueryDurationMs: successfulResults.length
      ? successfulResults.reduce((total, result) => total + result.durationMs, 0) / successfulResults.length
      : 0,
    durationMs,
    logFile: path.relative(evaluationRoot, logPath).replaceAll("\\", "/"),
    sourceSummary: dataset.summary,
  };
  const summaryPath = path.join(logDirectory, `evaluate-${runId}.summary.json`);
  await fsp.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  return { summary, logPath, summaryPath };
}

async function main() {
  const { datasetName, limit } = parseArguments(process.argv.slice(2));
  const datasetDirectory = findDatasetDirectory(datasetName);
  const dataset = loadEvaluationDataset(datasetDirectory);
  const { SqliteImageStore } = require(path.resolve(evaluationRoot, "../../dist/ai/sqlite-image-store.js"));
  const { embedImage, embedTexts } = require(path.resolve(evaluationRoot, "../../dist/mcp/sqlite-embedding.js"));
  const databasePath = path.resolve(
    evaluationRoot,
    "..",
    "data",
    `${normalizeDatasetName(path.basename(datasetDirectory))}.db`,
  );
  const databaseInfo = await rebuildEvaluationDatabase(dataset, databasePath, embedImage, embedTexts);
  const store = new SqliteImageStore({ databasePath });

  try {
    const result = await evaluateDataset(datasetDirectory, dataset, store, limit, databaseInfo);
    console.log(JSON.stringify({
      ...result.summary,
      logPath: path.resolve(result.logPath),
      summaryPath: path.resolve(result.summaryPath),
    }, null, 2));
    if (result.summary.errorCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
