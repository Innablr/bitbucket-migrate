#!/usr/bin/env node

const axios = require('axios');
const simpleGit = require('simple-git/promise');
const yargs = require('yargs')
    .option('org-uuids', {
        alias: 'u',
        describe: 'Specify Bitbucket organisation UUIDs',
        type: 'array'
    })
    .option('delete-original', {
        alias: 'd',
        describe: 'Delete original Bitbucket repositories',
        type: 'boolean'
    })
    .option('bb-creds', {
        alias: 'b',
        describe: 'Bitbucket username and App password separated by colon',
        type: 'string'
    })
    .option('gh-creds', {
        alias: 'g',
        describe: 'Github username and personal access token separated by colon',
        type: 'string'
    })
    .option('gh-org', {
        alias: 'o',
        describe: 'Github organisation',
        type: 'string'
    })
    .option('archive-pattern', {
        alias: 'a',
        describe: 'Pattern that indicates that the repo is archived if found in the username',
        type: 'string',
        default: 'archive'
    })
    .option('temp-path', {
        alias: 't',
        describe: 'Path where temprorarily clone the repositories',
        type: 'string',
        default: '/tmp'
    })
    .demandOption(['u', 'o', 'b', 'g'])
    .alias('help', 'h')
    .help('help')
    .argv;

class BitBucket {
    constructor(bbCreds) {
        const [username, password] = bbCreds.split(':');
        this.client = axios.create({
            baseURL: 'https://api.bitbucket.org/2.0',
            auth: {
                username,
                password
            }
        });
        console.log(`Initialised Bitbucket connector as ${username}`);
    }

    async getRepositories(bbOrg, uriNext) {
        const uri = uriNext || `/repositories/{${bbOrg}}`;
        console.log(`Fetching from ${uri}...`);
        const r = await this.client.get(uri);
        const chunk = r.data;
        console.log(`Got ${chunk.values.length} repositories`);
        if (chunk.next) {
            console.log('Fetching next...');
            return chunk.values.concat(await this.getRepositories(bbOrg, chunk.next));
        }
        console.log('Done.');
        return chunk.values;
    }

    async getAllRepositories(bbOrgs) {
        const groupedRepos = await Promise.all(bbOrgs.map(xo => this.getRepositories(xo)));
        return groupedRepos.flat();
    }

    dropRepo(repo) {
        console.log(`Deleting Bitbucket repo ${repo.name}...`);
        return this.client.delete(`/repositories/${repo.ownerUuid}/${repo.name}`);
    }
}

class Github {
    constructor(ghCreds) {
        const [username, password] = ghCreds.split(':');
        this.client = axios.create({
            baseURL: 'https://api.github.com',
            auth: {
                username,
                password
            }
        });
        console.log(`Initialised Github connector as ${username}`);
    }

    createRepo(repo) {
        console.log(`Creating Github repo ${repo.name}`);
        return this.client.post(`/orgs/${yargs.ghOrg}/repos`, {
            name: repo.name,
            private: true
        });
    }

    async postProcessRepo(repo) {
        if (repo.defaultBranch) {
            console.log(`Setting default branch of ${repo.name} to ${repo.defaultBranch}`);
            await this.client.patch(`/repos/${yargs.ghOrg}/${repo.name}`, {
                'default_branch': repo.defaultBranch
            });
        }
        console.log(`Setting repository topics: ${repo.topicList}`);
        await this.client.put(`/repos/${yargs.ghOrg}/${repo.name}/topics`, {
            names: repo.topicList
        }, {
            headers: {
                'Accept': 'application/vnd.github.mercy-preview+json'
            }
        });
        if (repo.isArchive) {
            console.log(`Archiving repo ${repo.name}`);
            await this.client.patch(`/repos/${yargs.ghOrg}/${repo.name}`, {
                archived: true
            });
        }
    }
}

class Repo {
    constructor(bbRepo) {
        this.name = bbRepo.name;
        this.projectName = bbRepo.project.name;
        this.ownerUuid = bbRepo.owner.uuid;
        this.defaultBranch = bbRepo.mainbranch ? bbRepo.mainbranch.name : undefined;
        this.cloneUri = bbRepo.links.clone.filter(x => x.name === 'ssh').pop().href;
        this.pushUri = `git@github.com:${yargs.ghOrg}/${this.name}.git`;
        this.destPath = `${yargs.tempPath}/${this.name}`;
        this.isArchive =
            yargs.archivePattern
                ? bbRepo.owner.username.toLowerCase().search(yargs.archivePattern) >= 0
                : false;
    }

    get topicList() {
        const repoTopic = this.projectName.toLowerCase().replace(/ /g, '-');
        const repoTopicList = [repoTopic];
        if (this.isArchive) {
            repoTopicList.push('archive');
        }
        return repoTopicList;
    }

    clone() {
        console.log(`Cloning ${this.cloneUri} into ${this.destPath}...`);
        return simpleGit('/tmp').clone(this.cloneUri, this.name, ['--bare']);
    }

    push() {
        console.log(`Pushing ${this.name} mirror into ${this.pushUri}`);
        return simpleGit(this.destPath).raw(['push', '--mirror', this.pushUri]);
    }
}

async function main() {
    const gh = new Github(yargs.ghCreds);
    const bb = new BitBucket(yargs.bbCreds);

    /* eslint-disable no-await-in-loop */
    // This is intentionally made sequential so you can track the progress. I hope you're not in a rush
    for (const xr of await bb.getAllRepositories(yargs.orgUuids)) {
        const repo = new Repo(xr);
        await repo.clone();
        await gh.createRepo(repo);
        await repo.push();
        await gh.postProcessRepo(repo);
        if (yargs.deleteOriginal) {
            await bb.dropRepo(repo);
        }
    }
    /* eslint-enable no-await-in-loop */
}

main();
