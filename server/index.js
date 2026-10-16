import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const SITE_PREFIX = '/risk-erm-ai/';
const CONFIG_FILE = process.env.APP_CONFIG_FILE || '/config/application.yaml';
const MANIFEST_KEY = 'attachment/wuyucongtest/knowledge-center/knowledge-files.json';
const STATIC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });

function loadApplicationConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return parseYaml(readFileSync(CONFIG_FILE, 'utf8')) || {};
  } catch (error) {
    throw new Error(`无法读取 ConfigMap 配置 ${CONFIG_FILE}: ${error.message}`);
  }
}

const applicationConfig = loadApplicationConfig();
const s3Config = applicationConfig.s3 || {};
const S3_ENDPOINT = process.env.S3_ENDPOINT || s3Config.endpoint || 'https://s3-test.gtjaf.net';
const S3_BUCKET = process.env.S3_BUCKET || s3Config.bucket || 'gxj-zg-dev';
const S3_REGION = process.env.S3_REGION || s3Config.region || 'us-east-1';

function emptyManifest() {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    total: 0,
    modules: {
      business: [],
      policy: [],
      case: [],
      industry: [],
      skill: []
    }
  };
}

function s3Client() {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || s3Config['access-key'];
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || s3Config['secret-key'];
  if (!accessKeyId || !secretAccessKey) {
    const error = new Error('S3 credentials are not configured');
    error.code = 'S3_CONFIG_MISSING';
    throw error;
  }
  return new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: s3Config['path-style-access'] !== false,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function isNotFound(error) {
  return error?.name === 'NoSuchKey' || error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404;
}

function validManifest(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && value.modules && typeof value.modules === 'object';
}

async function readManifest(_request, reply) {
  try {
    const result = await s3Client().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: MANIFEST_KEY }));
    const manifest = JSON.parse(await result.Body.transformToString('utf-8'));
    if (!validManifest(manifest)) return reply.code(502).send({ code: 502, msg: 'S3 清单格式不正确', data: null });
    if (result.ETag) reply.header('ETag', result.ETag);
    return { code: 0, msg: 'success', data: manifest };
  } catch (error) {
    if (isNotFound(error)) return { code: 0, msg: 'success', data: emptyManifest() };
    app.log.error({ err: error }, 'Failed to read knowledge manifest');
    const status = error?.code === 'S3_CONFIG_MISSING' ? 503 : 500;
    return reply.code(status).send({ code: status, msg: status === 503 ? 'S3 凭证未配置' : '读取共享清单失败', data: null });
  }
}

async function writeManifest(request, reply) {
  if (!validManifest(request.body)) return reply.code(400).send({ code: 400, msg: '清单格式不正确', data: null });
  const manifest = { ...request.body, generatedAt: new Date().toISOString() };
  manifest.total = Object.values(manifest.modules).reduce((sum, files) => sum + (Array.isArray(files) ? files.length : 0), 0);
  try {
    const result = await s3Client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: MANIFEST_KEY,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json; charset=utf-8'
    }));
    if (result.ETag) reply.header('ETag', result.ETag);
    return { code: 0, msg: 'success', data: { bucket: S3_BUCKET, key: MANIFEST_KEY, etag: result.ETag || '' } };
  } catch (error) {
    app.log.error({ err: error }, 'Failed to write knowledge manifest');
    const status = error?.code === 'S3_CONFIG_MISSING' ? 503 : 500;
    return reply.code(status).send({ code: status, msg: status === 503 ? 'S3 凭证未配置' : '保存共享清单失败', data: null });
  }
}

app.get('/healthz', async () => ({ status: 'ok' }));
app.get('/api/knowledge-manifest', readManifest);
app.put('/api/knowledge-manifest', writeManifest);
app.get(`${SITE_PREFIX}api/knowledge-manifest`, readManifest);
app.put(`${SITE_PREFIX}api/knowledge-manifest`, writeManifest);

await app.register(fastifyStatic, {
  root: STATIC_ROOT,
  prefix: SITE_PREFIX,
  decorateReply: false
});

app.get('/', async (_request, reply) => reply.redirect(SITE_PREFIX));

try {
  await app.listen({ host: HOST, port: PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
