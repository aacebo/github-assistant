import debug from 'debug';
import { Octokit } from 'octokit';

export type ContentTree = {
  [name: string]: string | ContentTree;
};

const log = debug('app');

export async function read(octokit: Octokit, owner: string, repo: string, path: string = '') {
  log(`reading ${path}...`);

  const { data } = await octokit.rest.repos.getContent({
    owner: owner,
    repo: repo,
    path: path
  });

  const tree: ContentTree = { };

  if (Array.isArray(data)) {
    const content = await Promise.all(data.map(item => read(
      octokit,
      owner,
      repo,
      item.path
    )));

    for (let i = 0; i < content.length; i++) {
      tree[data[i].name] = content[i];
    }
  } else if (data.type === 'file') {
    return Buffer.from(data.content, 'base64').toString('utf8');
  }

  return tree;
}
