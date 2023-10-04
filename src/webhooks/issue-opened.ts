import OpenAI from 'openai';
import { Octokit } from 'octokit';
import { IssuesOpenedEvent } from '@octokit/webhooks-types';
import { Collection } from 'chromadb';

type IssueOpenedArgs = {
  octokit: Octokit;
  payload: IssuesOpenedEvent;
}

export function onIssueOpened(
  openai: OpenAI,
  collection: Collection
) {
  return async ({ octokit, payload }: IssueOpenedArgs) => {
    if (!payload.issue.body) return;

    const res = await collection.query({
      nResults: 2,
      queryTexts: payload.issue.body
    });

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
            the repository source code is: ${JSON.stringify(res.documents)}.
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
