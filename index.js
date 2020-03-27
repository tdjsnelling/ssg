#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const http = require('http')
const handler = require('serve-handler')
const chalk = require('chalk')
const sass = require('node-sass')
const prettier = require('prettier')
const argparse = require('argparse').ArgumentParser
const chokidar = require('chokidar')

const remark = require('remark')
const recommended = require('remark-preset-lint-recommended')
const html = require('remark-html')
const highlight = require('remark-highlight.js')
const math = require('remark-math')
const htmlKatex = require('remark-html-katex')

const pkg = require('./package.json')

const parser = new argparse({
  version: pkg.version,
  addHelp: true,
})

parser.addArgument(['-s', '--serve'], {
  default: false,
  action: 'storeTrue',
  help: 'Serve the site after building',
})

parser.addArgument(['-p', '--port'], {
  defaultValue: 3000,
  help: 'Port to run the web server on. Default 3000',
})

parser.addArgument('path', {
  metavar: 'PATH',
  type: String,
  help: 'Path of the directory to be built',
})

const args = parser.parseArgs()

const baseHtml = `<html>
  <head>
    %%HEAD%%
  </head>
  <body>
    %%CONTENT%%
  </body>
</html>`

const startTime = +Date.now()
let generatedFiles = 0
let copiedAssets = 0

console.log(`${chalk.green('tdjsnelling/ssg')} v${pkg.version}`)

const baseDir = path.resolve(args.path)

console.log(`${chalk.cyan('base directory:')} ${baseDir}`)

if (!fs.existsSync(path.resolve(baseDir, 'out'))) {
  fs.mkdirSync(path.resolve(baseDir, 'out'))
}

const getFiles = directory => {
  const files = fs.readdirSync(directory)
  const resolved = files.map(file => {
    const res = path.resolve(directory, file)
    return fs.statSync(res).isDirectory()
      ? res.endsWith('/out')
        ? null
        : getFiles(res)
      : res
  })
  return resolved.reduce((a, f) => a.concat(f), [])
}

const allFiles = getFiles(baseDir)
const markdownFiles = allFiles.filter(x => x && x.endsWith('.md'))
const assets = allFiles.filter(x => x && !x.endsWith('.md'))

const buildHtml = file => {
  let converter = remark().use(recommended).use(html)

  console.log(`${chalk.cyan('processing:')} ${file}`)
  let md = fs.readFileSync(file, 'utf-8')

  const parsedOpts = {}

  if (md.startsWith('%%\n')) {
    const opts = md.split('%%\n')[1].split('\n')
    opts.map(option => {
      if (option.length) {
        const [key, value] = option.split('=')
        parsedOpts[key.trim()] = value.trim()
      }
    })
    console.log(
      `${chalk.yellow('  parsed options:')} ${JSON.stringify(parsedOpts)}`
    )
    md = md.split('%%\n')
    md.splice(0, 2)
    md = md.join('')
  }

  const filename = file.replace('.md', '.html')

  let dir = filename.split('/')
  dir.pop()
  dir = dir.join('/')

  const outDir = dir.replace(baseDir, baseDir + '/out')

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir)
    console.log(`${chalk.yellow('  created directory:')} ${outDir}`)
  }

  if (parsedOpts.math === 'yes') {
    converter = converter.use(math).use(htmlKatex)
  }

  if (parsedOpts.code) {
    converter = converter.use(highlight)
  }

  const head = []

  converter.process(md, (err, htmlFile) => {
    if (err) {
      console.error(`${chalk.red('  error:')} converting markdown -> html`)
      throw err
    }

    console.log(chalk.yellow('  converted markdown -> html'))

    if (parsedOpts.title) {
      head.push(`<title>${parsedOpts.title}</title>`)
    }

    if (parsedOpts.style) {
      head.push(
        `<link rel="stylesheet" href="${parsedOpts.style.replace(
          /.s(a|c)ss/gm,
          '.css'
        )}">`
      )
      console.log(`${chalk.yellow('  imported styles:')} ${parsedOpts.style}`)
    }

    if (parsedOpts.math === 'yes') {
      head.push(
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.11.1/dist/katex.min.css" integrity="sha384-zB1R0rpPzHqg7Kpt0Aljp8JPLqbXI3bhnPWROx27a9N0Ll6ZP/+DiW/UqRcLbRjq" crossorigin="anonymous">'
      )
      console.log(chalk.yellow('  including math support'))
    }

    if (parsedOpts.code === 'yes') {
      head.push(
        `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@9.18.1/build/styles/${
          parsedOpts.highlight || 'default'
        }.min.css">`
      )
      console.log(
        `${chalk.yellow('  including syntax highlighting:')} ${
          parsedOpts.highlight || 'default'
        }`
      )
    }

    let html = baseHtml
    html = html.replace('%%HEAD%%', head.join('\n'))
    html = html.replace('%%CONTENT%%', String(htmlFile))

    fs.writeFileSync(
      filename.replace(baseDir, baseDir + '/out'),
      prettier.format(html, { parser: 'html' })
    )
    console.log(chalk.yellow('  wrote html file'))

    generatedFiles += 1
  })
}

const copyAsset = file => {
  console.log(`${chalk.cyan('processing:')} ${file}`)

  let dir = file.split('/')
  const filename = dir.pop()
  dir = dir.join('/')

  const outDir = dir.replace(baseDir, baseDir + '/out')

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir)
    console.log(`${chalk.yellow('  created directory:')} ${outDir}`)
  }

  if (!file.endsWith('.sass') && !file.endsWith('.scss')) {
    fs.copyFileSync(file, path.resolve(outDir, filename))
    console.log(`${chalk.yellow('  copied asset:')} ${file}`)
  } else {
    let style = fs.readFileSync(file, 'utf-8')
    let result
    try {
      result = sass.renderSync({ data: style })
    } catch (e) {
      console.error(
        `${chalk.red('  error:')} transpiling styles ${file} (line ${e.line})`
      )
      console.error(`${chalk.red('  error:')} ${e.message}`)
      throw e.formatted
    }
    if (result.css) {
      console.log(`${chalk.yellow('  transpiled styles:')} ${file}`)
      fs.writeFileSync(
        file.replace(baseDir, baseDir + '/out').replace(/.s(a|c)ss/gm, '.css'),
        prettier.format(String(result.css), { parser: 'css' })
      )
      console.log(
        `${chalk.yellow('  copied asset:')} ${file.replace(
          /.s(a|c)ss/gm,
          '.css'
        )}`
      )
    }
  }

  copiedAssets += 1
}

markdownFiles.map(file => {
  buildHtml(file)
})

assets.map(file => {
  copyAsset(file)
})

console.log(`${chalk.green('done!')} generated ${generatedFiles} static files`)
console.log(`${chalk.green('done!')} copied ${copiedAssets} static assets`)
console.log(`${chalk.green('done!')} site generated in ${baseDir + '/out'}`)
console.log(
  `${chalk.green('done!')} in ${((+Date.now() - startTime) / 1000).toFixed(
    2
  )} seconds`
)

if (args.serve) {
  const server = http.createServer((request, response) => {
    return handler(request, response, {
      public: path.resolve(baseDir, 'out'),
    })
  })

  server.listen(args.port || 3000, () => {
    console.log(
      `${chalk.green('done!')} server running at http://localhost:${
        args.port || 3000
      }`
    )
  })

  chokidar
    .watch(baseDir, {
      ignored: path.resolve(baseDir, 'out'),
    })
    .on('change', path => {
      console.log(`${chalk.cyan('---\ndetected change:')} ${path}`)
      if (path.endsWith('.md')) {
        buildHtml(path)
      } else {
        copyAsset(path)
      }
    })

  console.log(`${chalk.green('done!')} watching for file changes`)
}
