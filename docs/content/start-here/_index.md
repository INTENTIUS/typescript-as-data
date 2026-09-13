---
title: "Start here"
description: "For a reader new to TypeScript, to deploy tools, or to both. What the words on this site mean and what to do first."
weight: 5
hideChildren: true
---

This page assumes nothing. If you already write TypeScript and run a deploy tool, skip to [what it enables](/typescript-as-data/what-it-enables/) or [try it](/typescript-as-data/try-it/).

## The problem this site is about

Many tools take a file that describes what you want and then make the world match it. A tool that manages a code-hosting organization reads a file saying which repositories exist and who may merge to them. The file is called a policy or a configuration, and the tool reads it every time it runs.

Almost all such files are written in YAML, a plain text format for structured settings: indentation shows nesting, a colon separates a name from its value, a dash starts a list item.

It is easy to read and has no way to check itself. A misspelt key is ignored without an error. A block repeated twenty times is copied twenty times, and changed twenty times.

## What TypeScript is, and why it helps here

TypeScript is a programming language. It is JavaScript with type annotations added. JavaScript is the language browsers run; a type says what shape a value has, and a checker confirms it. Outside a browser it runs with Node. As you type, the editor completes names, and it marks a misspelt key as an error before you have saved the file.

Written in TypeScript, the policy above is a value with a declared type. A repeated block becomes a small function used twenty times, and a change is made once. The tool reads the same values it would have read from the YAML.

## Data, folded or run

A TypeScript file is a program. That is the catch. A program can do anything when it runs, so a tool that ran your policy to read it would be running your code, with whatever that code does.

There is another way to read it. When a file only lists values, a tool can read them off the text without running it, and the specification calls that **folding**. When a file does more, the tool hands it to the JavaScript engine and reads the exports once the program finishes, which the specification calls **running**.

The YAML is the same either way. What differs is whether your file was executed to produce it. Folding is the normal case, running the fallback, and where both are possible they agree.

## What you need on your machine

The tutorial runs everything on your own computer. You need four things.

A terminal is the program where you type commands. Every operating system ships one.

Git fetches a project's source from a code host. It is at [git-scm.com](https://git-scm.com/downloads).

Node runs JavaScript and TypeScript outside a browser. Version 22 or later is at [nodejs.org](https://nodejs.org/), and it brings `npm`, the command that installs packages.

Docker runs a throwaway copy of a code-hosting server on your machine so nothing real is touched. Install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/) and start it.

With those in place, [the tutorial](/typescript-as-data/try-it/) takes about ten minutes. It explains each command as it goes.

## Where to go next

If you want to see what becomes possible once a policy is data, read [what it enables](/typescript-as-data/what-it-enables/). Someone who maintains a tool and wants it to read `.ts` files should read [add it to your platform](/typescript-as-data/for-your-platform/). The [specification](/typescript-as-data/spec/) section is for checking the claims; it holds the rules and the reference implementation along with every measurement. Any word you do not know is in [the glossary](/typescript-as-data/glossary/).
