import { createServer } from 'node:http';
import OpenAI from 'openai';
import { App, createNodeMiddleware } from 'octokit';

import { ContentTree } from './read';
import * as webhooks from './webhooks';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('environment variable `OPENAI_API_KEY` is required');
}

if (!process.env.APP_ID || !process.env.APP_CLIENT_ID || !process.env.APP_CLIENT_SECRET || !process.env.APP_PRIVATE_KEY) {
  throw new Error('environment variables `APP_ID`, `APP_CLIENT_ID`, `APP_CLIENT_SECRET`, and `APP_PRIVATE_KEY` are required');
}

const storage: { [name: string]: string | ContentTree } = { };
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

app.webhooks.on('installation.created', webhooks.onInstallationCreated(storage));
app.webhooks.on('issues.opened', webhooks.onIssueOpened(storage, openai));
app.webhooks.on('issue_comment.created', webhooks.onIssueCommentCreated(storage, openai));

createServer(createNodeMiddleware(app)).listen(3000);
