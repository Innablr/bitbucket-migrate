Bitbucket to Github migration
======

Preface
------

We have been a bit dissatisfied with Bitbucket Cloud, mainly with a lack of repo archiving, which lead to having accumulated a lot of debris we were too sentimental to part with. I can't say that Github is ideal too (for example, I would like a means to categorise repositories, something similar to projects in Bitbucket, but the only thing I got was topics), but definitely it's a step forward.

I googled for tools to help me migrate our 130+ repos, but didn't find anything useful. [bitbucket-cli](https://bitbucket.org/zhemao/bitbucket-cli) is outdated and uses the deprecated 1.0 Bitbucket API. And this [abomination](https://marketplace.atlassian.com/apps/1211193/bitbucket-command-line-interface-cli?hosting=server&tab=overview) is absolutely ridiculous.

I had a look at the both Bitbucket and Github APIs and figured that both were prettu straightforward, so here it is.

What it does
------

This tool clones repositories from multiple Bitbucket teams one by one, for each one it creates a repo with the same name in Github and pushes the code with `--mirror` across. Afterwards it does some tidying up on the Github repo and the optionally deletes the original in Bitbucket

1. It obtains a combined list of repos in all specified Bitbucket teams and sequentially iterates over those
2. It clones the repo with `--bare` via SSH (sorry, HTTPS is not supported) into a temporary folder of your choice
3. It creates a new repository in Github with the same name
4. It pushes the repo with `--mirror` again via SSH
5. It sets the default branch to whatever it was in Bitbucket
6. Bitbucket project name gets converted into lowercase with dashes instead of spaces and appended to the topic list
7. If the Bitbucket team name contains the specified string, the repository in Github gets archived and `archive` gets appended to the repo topic list (optional)

What happens if it fails
------

This tool is pretty raw, I built it to only cover my use case. Your circumstances may differ and things can go wrong. If you need a hand, raise an issue and we'll see what we can do.

I didn't do any extra exception processing, so if a step fails the script will immediately bomb out with a Node.JS stack trace. This is pretty safe and should prevent the script from deleting a repo, which hasn't migrated properly, for example.

Error messages sometimes can be cryptic, like `(node:4138) UnhandledPromiseRejectionWarning: Error: Request failed with status code 404`, although the script prints out a message for every step it performs so it should be clear for you what exactly failed.

How to use it
------

Install the tool with `npm install -g bitbucket-migrate`. If you run the `bitbucket-migrate --help` it will show you help.

You will need:
 * UUIDs of the teams in Bitbucket you want to migrate across. You can find them in the URL in your browser when you open any of your repos. We had a separate team for archived projects, called innablr-archive, you may have multiple teams as well. If you are migrating your personal repos, take your username instead of the UUID (it should work too, although I haven't tested it)
 * Generate an App Password in Bitbucket. Click on your avatar, choose Your Profile, click Settings and open App Passwords. Give it the 'Projects Read' permission. If you are planning to delete the repositories also click on 'Repositories Delete'. Write down the password
 * Name of you organisation in Github. If you are migrating into your personal account you can use your username (again it theoretically should work but I haven't tested it)
 * Personal access token in Github. Click on your avatar and choose Settings, open Developer Settings and go to Personal Access Tokens. Create a token with 'repo' permissions and write down the password
 * Find a directory on your disk with enough space to hold all your repos. By default the script uses `/tmp`
 * Add your Bitbucket and Github SSH keys to your SSH agent with `ssh-add`

To start the migration run the script as follows:

```
$ bitbucket-migrate -u dc343d85-91f1-4693-ae0d-abc4ff616f56 80820711-69a1-4098-96b3-8049a62324fb -b alex_the_v:eiChaethauj4naiqu7be -g abukharov:2bd5b9c6bc87f4f035979693cdf35ef827d82ba9 -o Innablr -d
```

* With `-u` specify your Bitbucket team UUIDs separated by space
* `-b` - your Bitbucket username and App Password separated by colon
* `-g` - your Github username and Personal Token separated by colon
* `-o` - your Github organisation
* Set `-d` if you want your Bitbucked repos deleted as they get migrated

You can specify the archive team pattern using `-a`. The script will check if the username on the repo contains this substring and if it does, the repo in Github will be automatically archived.

If you want to use another temporary directory instead of `/tmp` use `-t`

Good luck.
