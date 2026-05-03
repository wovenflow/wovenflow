#!/usr/bin/env node
// wovenflow subflow worktree helper
// Manages per-behavior git worktrees for parallel subagent dispatch.
//
// Subcommands:
//   create <behavior-id> [base-ref]    create .wovenflow/worktrees/<id> on branch wovenflow/<id>
//   merge  <behavior-id> <target>      merge wovenflow/<id> into <target> (must be checked out), then cleanup
//   cleanup <behavior-id>              force-remove worktree and delete its branch
//   list                               git worktree list
//
// Shared dependency dirs (avoids re-installing per worktree):
//   WOVENFLOW_WORKTREE_LINKS  colon-separated paths to symlink from repo root into each new
//                             worktree. Default: "node_modules". Set to "" to disable. Examples:
//                               WOVENFLOW_WORKTREE_LINKS="node_modules:.venv"
//                               WOVENFLOW_WORKTREE_LINKS="node_modules:vendor/bundle"
//   Each path is symlinked only if it exists in the repo root. Symlinks are unlinked before
//   `merge` and `cleanup` so git's worktree removal never traverses into the shared target.

import { execSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
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

function sharedLinkPaths() {
	const raw = process.env.WOVENFLOW_WORKTREE_LINKS ?? 'node_modules';
	return raw.split(':').map(s => s.trim()).filter(Boolean);
}

function linkSharedDirs(wt) {
	const root = repoRoot();
	for (const rel of sharedLinkPaths()) {
		const src = path.join(root, rel);
		const dst = path.join(wt, rel);
		if (!existsSync(src)) continue;
		if (existsSync(dst)) continue;
		mkdirSync(path.dirname(dst), { recursive: true });
		symlinkSync(src, dst);
	}
}

function unlinkSharedDirs(wt) {
	for (const rel of sharedLinkPaths()) {
		const dst = path.join(wt, rel);
		try {
			const stat = lstatSync(dst);
			if (stat.isSymbolicLink()) unlinkSync(dst);
		} catch { /* not present */ }
	}
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
	linkSharedDirs(wt);
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
	unlinkSharedDirs(wt);
	git(`worktree remove "${wt}"`);
	git(`branch -d ${branch}`);
}

function cmdCleanup(behaviorId) {
	if (!behaviorId) usage();
	const branch = branchName(behaviorId);
	const wt = worktreeDir(behaviorId);
	if (existsSync(wt)) {
		unlinkSharedDirs(wt);
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
