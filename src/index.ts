import { createServer } from 'node:http';
import OpenAI from 'openai';
import { App, createNodeMiddleware } from 'octokit';
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';

import * as webhooks from './webhooks';

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('environment variable `OPENAI_API_KEY` is required');
  }

  if (!process.env.APP_ID || !process.env.APP_CLIENT_ID || !process.env.APP_CLIENT_SECRET || !process.env.APP_PRIVATE_KEY) {
    throw new Error('environment variables `APP_ID`, `APP_CLIENT_ID`, `APP_CLIENT_SECRET`, and `APP_PRIVATE_KEY` are required');
  }

  const chroma = new ChromaClient({
    path: 'http://127.0.0.1:8000'
  });

  const collection = await chroma.getOrCreateCollection({
    name: 'source',
    embeddingFunction: new OpenAIEmbeddingFunction({
      openai_api_key: process.env.OPENAI_API_KEY
    })
  });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const app = new App({
    appId: process.env.APP_ID,
    privateKey: process.env.APP_PRIVATE_KEY,
    oauth: {
      clientId: process.env.APP_CLIENT_ID,
      clientSecret: process.env.APP_CLIENT_SECRET,
    },
    webhooks: { secret: 'test' }
  });

  app.webhooks.on('installation.created', webhooks.onInstallationCreated(collection));
  app.webhooks.on('issues.opened', webhooks.onIssueOpened(openai, collection));

  createServer(createNodeMiddleware(app)).listen(3000);
})()
.catch(console.error);
