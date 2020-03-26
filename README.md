# ssg
_ssg_ is a tiny Markdown → HTML static site generator.

## Install

Install _ssg_ with

```
npm i -g @tdjsnelling/ssg
```

or 

```
yarn global add @tdjsnelling/ssg
```

## Usage

_ssg_ only requires a path to the directory you wish to build.

```
ssg .
```

Markdown files will be compiled to HTML and all other static assets will be copied over to the build directory. HTML is run through [prettier](https://prettier.io/) to ensure built files remain human readable and editable.

Optionally, you can tell _ssg_ to serve the build and watch for changes with the `--serve` or `-s` option. By default the server runs on port 3000, this can be changed with the `--port` or `-p` option.

```
ssg . -s -p 5000
```

_ssg_ will automatically rebuild files as and when it detects changes.

## Options

Each markdown file can have an 'options' section before the content, to configure the build process. This section is enclosed in double-percent symbols, `%%`.

The existing options are as follows:
* title: the <title> to include in the page head
* style: relative path to a CSS or SASS/SCSS file to include on the page. SASS/SCSS is automatically transpiled
* math: if `yes`, include KaTeX rendering support on the page
* code: if `yes`, include syntax highlighting support on the page
* highlight: the syntax highlighting theme to use. should be the name of a [highlight.js theme](https://github.com/highlightjs/highlight.js/tree/master/src/styles), otherwise `default` is used

## Example

A basic markdown file might look like this:

````markdown
%%
title = ssg demo
style = index.css
code = yes
%%

# ssg demo

This is a demo file for ssg.

Here is some code to be highlighted:

```js
var i;
var fib = []; // Initialize array!

fib[0] = 0;
fib[1] = 1;
for (i = 2; i <= 10; i++) {
  // Next fibonacci number = previous + one before previous
  // Translated to JavaScript:
  fib[i] = fib[i - 2] + fib[i - 1];
  console.log(fib[i]);
}
```
````
