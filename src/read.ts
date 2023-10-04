import debug from 'debug';
import { Collection } from 'chromadb';
import { Octokit } from 'octokit';

const log = debug('app');

export async function read(
  octokit: Octokit,
  owner: string,
  repo: string,
  collection: Collection,
  path: string = ''
) {
  log(`reading ${path}...`);

  const { data } = await octokit.rest.repos.getContent({
    owner: owner,
    repo: repo,
    path: path
  });

  if (Array.isArray(data)) {
    await Promise.all(data.map(item => read(
      octokit,
      owner,
      repo,
      collection,
      item.path
    )));
  } else if (data.type === 'file') {
    const content = Buffer.from(data.content, 'base64').toString('utf8');

    await collection.add({
      ids: [data.path],
      metadatas: [{
        name: data.name,
        path: data.path,
        url: data.url,
        size: data.size
      }],
      documents: [content]
    });
  }
}
