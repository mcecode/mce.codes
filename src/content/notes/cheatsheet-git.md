---
title: "Cheatsheet: Git"
dateCreated: 2024-11-12
dateUpdated: 2025-12-08
---

## Preamble

### Aims

To document Git commands and flags that I tend to use but forget when I haven't
used them in a while.

### Assumptions

Familiarity with Git concepts and the usual `init`, `pull`, `add`, `commit`,
`push` flow.

## Branching

### List branches

```console
git branch
```

### Create branch

```console
git branch <branch>
```

### Switch to branch

```console
git switch <branch>
```

### Create branch then switch to it

```console
git switch --create <branch>
```

Or shorthand:

```console
git switch -c <branch>
```

### Rename current branch

```console
git switch --move <new-name>
```

Or shorthand:

```console
git switch -m <new-name>
```

### Delete branch

```console
git branch --delete <branch>
```

Or shorthand:

```console
git branch -d <branch>
```

### Delete branch WITHOUT pushing it upstream

```console
git branch --delete --force <branch>
```

Or shorthand:

```console
git branch -D <branch>
```

## Stashing

### Stash changes

```console
git stash
```

Or to stash only a specific file or directory:

```console
git stash -- <path>
```

Or to add a message to remember the stash by:

```console
git stash --message <message>
```

Or shorthand:

```console
git stash -m <message>
```

### List stashes

```console
git stash list
```

### Show changes in stash

```console
git stash show [<index>]
```

### Apply stash to current working tree

```console
git stash apply [<index>]
```

### Apply stash to current working tree THEN remove it

```console
git stash pop [<index>]
```

### Remove stash

```console
git stash drop [<index>]
```

### Remove all stashes

```console
git stash clear
```

## Staging

### Stage part of a file

```console
git add --patch <file>
```

Or shorthand:

```console
git add -p <file>
```

**Note:** `y` means stage this hunk. `n` means don't stage this hunk. `s` means
split this hunk (not always possible). `e` means manually edit this hunk to add
the specific lines you want to add (done when hunk is too big and `s` is not
possible).

## Committing

### Undo latest commit

```console
git reset HEAD~
```

Or to keep uncommitted changes staged:

```console
git reset --soft HEAD~
```

Or to discard ALL uncommitted changes:

```console
git reset --hard HEAD~
```

**Note:** You can lose a lot of work when using `--hard`, so only use it if
you're sure you want to nuke your working tree (yes, you can use `reflog`, but
still).

### Change latest commit message

```console
git commit --amend
```

**Note:** There should be no staged changes or else those will be added to the
latest commit.

### Change previous commit messages

```console
git rebase --interactive <hash>~
```

Or shorthand:

```console
git rebase -i <hash>~
```

Then, change `pick` to `reword` or `r` on the commits whose message you want to
change.

### Add changes to latest commit

Stage new changes, then:

```console
git commit --amend
```

Or to NOT change the commit message:

```console
git commit --amend --no-edit
```

### Change previous commits

```console
git rebase --interactive <hash>~
```

Or shorthand:

```console
git rebase -i <hash>~
```

Then, change `pick` to `edit` or `e` on the commits you want to change. Once
you're done with your changes, stage and commit them:

```console
git commit --amend
```

Or to NOT change the commit message:

```console
git commit --amend --no-edit
```

Then, move on to the next commit to change:

```console
git rebase --continue
```

Or to discard the changes you've done so far and exit the interactive rebase:

```console
git rebase --abort
```

## Rebasing

### Fix rebase conflicts

When conflicts occur from a `git rebase` or a `git pull --rebase`. Fix the files
with conflicts, stage them, then run:

```console
git rebase --continue
```

## Pushing

### Push to a remote branch with a different name

```console
git push [<repository>] <local-branch>:<remote-branch>
```

## References

- <https://git-scm.com/docs>
- <https://stackoverflow.com/q/179123>
- <https://stackoverflow.com/q/927358>
- <https://stackoverflow.com/q/1085162>
- <https://stackoverflow.com/q/1186535>

## Changelog

- December 08, 2025
  - Update "Stash changes" by adding the command to stash only a specific file
    or directory
  - Break down introductory paragraph into sections
- August 25, 2025
  - Add "Show changes in stash"
  - Add "Fix rebase conflicts"
  - Add "Push to a remote branch with a different name"
