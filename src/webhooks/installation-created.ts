import { Octokit } from 'octokit';
import { InstallationCreatedEvent } from '@octokit/webhooks-types';
import { Collection } from 'chromadb';

import { read } from '../read';

type InstallationCreatedArgs = {
  octokit: Octokit;
  payload: InstallationCreatedEvent;
}

export function onInstallationCreated(
  collection: Collection
) {
  return async ({ octokit, payload }: InstallationCreatedArgs) => {
    console.log(payload);
    if (!payload.repositories) return;

    for (const repo of payload.repositories) {
      try {
        await read(
          octokit,
          payload.sender.login,
          repo.name,
          collection
        );
      } catch (err) {
        console.error(JSON.stringify(err, null, 2));
      }
    }
  };
};
