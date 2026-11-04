# ECC in this project

[ECC](https://github.com/affaan-m/ECC) (MIT, © Affaan Mustafa, see `ECC-LICENSE`) is a large library of Claude Code skills, agents and rules. Rather than install all 314 skills, this repo vendors the subset that fits a Vite + React + TypeScript app, so they load automatically for anyone (or any cloud session) working here.

Source: `affaan-m/ECC` @ `b38be6a7f6350964d59328b52f0624e1d1d552d1` (release 2.2.3).

| Kind | Vendored |
|---|---|
| Skills (`.claude/skills/`) | tdd-workflow, verification-loop, coding-standards, typescript-patterns, react-patterns, react-testing, frontend-patterns, vite-patterns, frontend-a11y, make-interfaces-feel-better, e2e-testing, security-review, search-first, git-workflow |
| Agents (`.claude/agents/`) | planner, code-reviewer, typescript-reviewer, react-reviewer, tdd-guide, build-error-resolver, security-reviewer |
| Rules (`.claude/rules/ecc/`) | common, typescript, react, web |

Not vendored: ECC's hooks runtime and scripts (nothing here executes code on your machine).

The project's own skill is `.claude/skills/profocus/`; it ties the ECC workflow to this codebase.

## Updating or getting all of ECC

To refresh the vendored files, clone ECC at a reviewed commit and copy the same folders over, then update the commit hash above.

If you'd rather have the full plugin on your own machine (all skills, agents and commands, kept up to date), install it once at user scope instead, and delete the vendored copies here to avoid duplicates:

```text
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```
