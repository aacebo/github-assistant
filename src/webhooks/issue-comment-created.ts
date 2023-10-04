import OpenAI from 'openai';
import { Octokit } from 'octokit';
import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';

import { read, ContentTree } from '../read';

type IssueCommentCreatedArgs = {
  octokit: Octokit;
  payload: IssueCommentCreatedEvent;
}

export function onIssueCommentCreated(
  storage: { [key: string]: string | ContentTree },
  openai: OpenAI
) {
  return async ({ octokit, payload }: IssueCommentCreatedArgs) => {
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
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `
            you are a GitHub assistant for the repository ${payload.repository.name} ${payload.repository.url}.
            the repository source code is written in the languages: ${Object.keys(langs).join(', ')}.
            the repository source code tree is: ${JSON.stringify(source)}.
          `.trim()
        },
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
  };
};
