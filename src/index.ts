import { createServer } from 'node:http';
import OpenAI from 'openai';
import { App, createNodeMiddleware } from 'octokit';

import { ContentTree, read } from './read';

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

app.webhooks.on('installation.created', async ({ octokit, payload }) => {
  if (!payload.repositories) return;

  for (const repo of payload.repositories) {
    try {
      storage[repo.full_name] = await read(
        octokit,
        payload.sender.login,
        repo.name
      );
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  }
});

app.webhooks.on('issues.opened', async ({ octokit, payload }) => {
  if (!payload.issue.body) return;

  if (!storage[payload.repository.full_name]) {
    storage[payload.repository.full_name] = await read(
      octokit,
      payload.sender.login,
      payload.repository.name
    );
  }

  const source = storage[payload.repository.full_name];
  const { data: langs } = await octokit.request('GET /repos/{owner}/{repo}/languages', {
    owner: payload.sender.login,
    repo: payload.repository.name
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: `you are a GitHub assistant for the repository ${payload.repository.name} ${payload.repository.url}` },
      { role: 'user', content: `the repository source code is in the languages: ${Object.keys(langs).join(', ')}` },
      { role: 'user', content: `the repository source code tree is: ${JSON.stringify(source)}` },
      { role: 'user', content: payload.issue.body }
    ]
  });

  await octokit.rest.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: completion.choices[0].message.content!
  });
});

app.webhooks.on('issue_comment.created', async ({ octokit, payload }) => {
  const { data: app } = await octokit.request('GET /app');

  if (payload.comment.performed_via_github_app?.id === app.id) {
    return;
  }

  if (!storage[payload.repository.full_name]) {
    storage[payload.repository.full_name] = await read(
      octokit,
      payload.sender.login,
      payload.repository.name
    );
  }

  const { data: comments } = await octokit.rest.issues.listComments({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number
  });

  const source = storage[payload.repository.full_name];
  const { data: langs } = await octokit.request('GET /repos/{owner}/{repo}/languages', {
    owner: payload.repository.owner.login,
    repo: payload.repository.name
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: `you are a GitHub assistant for the repository ${payload.repository.name} ${payload.repository.url}` },
      { role: 'user', content: `the repository source code is in the languages: ${Object.keys(langs).join(', ')}` },
      { role: 'user', content: `the repository source code tree is: ${JSON.stringify(source)}` },
      { role: 'user', content: payload.issue.body },
      ...comments.map(comment => ({
        role: (comment.performed_via_github_app?.client_id === process.env.APP_CLIENT_ID ? 'assistant' : 'user') as 'assistant' | 'user',
        content: payload.comment.body
      }))
    ]
  });

  await octokit.rest.issues.createComment({
    owner: payload.sender.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: completion.choices[0].message.content!
  });
});

createServer(createNodeMiddleware(app)).listen(3000);
