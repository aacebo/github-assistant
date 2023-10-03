import { Octokit } from 'octokit';
import { InstallationCreatedEvent } from '@octokit/webhooks-types';

import { read, ContentTree } from '../read';

type InstallationCreatedArgs = {
  octokit: Octokit;
  payload: InstallationCreatedEvent;
}

export function onInstallationCreated(
  storage: { [key: string]: string | ContentTree }
) {
  return async ({ octokit, payload }: InstallationCreatedArgs) => {
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
  };
};
