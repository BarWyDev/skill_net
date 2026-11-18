#!/usr/bin/env bash
# Fails when course material (10xDevs skills, prompts, CLI metadata or the CLI's managed block) is in
# the git index. The course terms forbid publishing it, and this repository is public. Runs in the
# pre-commit hook and in the `ci` job; the material itself lives in ~/.claude/skills/.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

paths='(^|/)(\.claude|\.agents)/skills/10x-|(^|/)10x-[a-z0-9-]+/SKILL\.md$|^\.claude/prompts/|(^|/)\.10x-cli\.json$|(^|/)\.10x-cli-manifest\.json$'
marks='@przeprogramowani/10x-cli|10xDevs AI Toolkit'
status=0

if found=$(git ls-files | grep -E "$paths"); then
  echo "Course material is tracked by git:" >&2
  echo "$found" | sed 's/^/  /' >&2
  status=1
fi

# This script holds the markers itself, so it is the one excluded path.
if found=$(git grep --cached -I -l -E "$marks" -- . ':!scripts/check-no-course-material.sh'); then
  echo "Course material markers in file contents:" >&2
  echo "$found" | sed 's/^/  /' >&2
  status=1
fi

if [ "$status" -ne 0 ]; then
  echo "Remove it from the commit (git rm --cached <path>); keep course skills in ~/.claude/skills/." >&2
fi
exit "$status"
