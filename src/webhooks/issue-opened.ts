import OpenAI from 'openai';
import { Octokit } from 'octokit';
import { IssuesOpenedEvent } from '@octokit/webhooks-types';

import { read, ContentTree } from '../read';

type IssueOpenedArgs = {
  octokit: Octokit;
  payload: IssuesOpenedEvent;
}

export function onIssueOpened(
  storage: { [key: string]: string | ContentTree },
  openai: OpenAI
) {
  return async ({ octokit, payload }: IssueOpenedArgs) => {
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
        { role: 'user', content: payload.issue.body }
      ]
    });

    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      body: completion.choices[0].message.content!
    });
  };
};
