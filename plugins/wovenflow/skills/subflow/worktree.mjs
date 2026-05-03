#!/usr/bin/env node
// wovenflow subflow worktree helper
// Manages per-behavior git worktrees for parallel subagent dispatch.
//
// Subcommands:
//   create <behavior-id> [base-ref]    create .wovenflow/worktrees/<id> on branch wovenflow/<id>
//   merge  <behavior-id> <target>      merge wovenflow/<id> into <target> (must be checked out), then cleanup
//   cleanup <behavior-id>              force-remove worktree and delete its branch
//   list                               git worktree list

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function git(args, opts = {}) {
	return execSync(`git ${args}`, {
		encoding: 'utf-8',
		stdio: ['inherit', 'pipe', 'pipe'],
		...opts,
	}).trim();
}

function repoRoot() {
	return git('rev-parse --show-toplevel');
}

function worktreeDir(behaviorId) {
	return path.join(repoRoot(), '.wovenflow', 'worktrees', behaviorId);
}

function branchName(behaviorId) {
	return `wovenflow/${behaviorId.toLowerCase()}`;
}

function usage() {
	console.error('usage: worktree.mjs <create|merge|cleanup|list> [behavior-id] [base-ref|target-branch]');
	process.exit(1);
}

function cmdCreate(behaviorId, baseRef = 'HEAD') {
	if (!behaviorId) usage();
	const wt = worktreeDir(behaviorId);
	const branch = branchName(behaviorId);
	if (existsSync(wt)) {
		console.error(`error: worktree already exists at ${wt}. Run cleanup first.`);
		process.exit(1);
	}
	mkdirSync(path.dirname(wt), { recursive: true });
	git(`worktree add -b ${branch} "${wt}" ${baseRef}`);
	console.log(wt);
}

function cmdMerge(behaviorId, target) {
	if (!behaviorId || !target) usage();
	const branch = branchName(behaviorId);
	const wt = worktreeDir(behaviorId);
	const current = git('rev-parse --abbrev-ref HEAD');
	if (current !== target) {
		console.error(`error: current branch is ${current}, expected ${target}. Switch first.`);
		process.exit(1);
	}
	git(`merge --no-ff ${branch} -m "Merge ${behaviorId} (${branch})"`);
	git(`worktree remove "${wt}"`);
	git(`branch -d ${branch}`);
}

function cmdCleanup(behaviorId) {
	if (!behaviorId) usage();
	const branch = branchName(behaviorId);
	const wt = worktreeDir(behaviorId);
	if (existsSync(wt)) {
		try { git(`worktree remove --force "${wt}"`); } catch { /* may already be gone */ }
	}
	try { git(`branch -D ${branch}`); } catch { /* may not exist */ }
}

function cmdList() {
	console.log(git('worktree list'));
}

const [, , subcmd, ...args] = process.argv;
switch (subcmd) {
	case 'create': cmdCreate(args[0], args[1] ?? 'HEAD'); break;
	case 'merge': cmdMerge(args[0], args[1]); break;
	case 'cleanup': cmdCleanup(args[0]); break;
	case 'list': cmdList(); break;
	default: usage();
}
