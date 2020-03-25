const fs = require('fs')
const path = require('path')
const http = require('http')
const handler = require('serve-handler')
const chalk = require('chalk')
const sass = require('node-sass')
const argparse = require('argparse').ArgumentParser
const open = require('open')

const remark = require('remark')
const recommended = require('remark-preset-lint-recommended')
const html = require('remark-html')

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

const converter = remark().use(recommended).use(html)

const baseHtml = `<html>
  <head>
    <title>%%TITLE%%</title>
    <style>%%STYLE%%</style>
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
const assets = allFiles.filter(
  x =>
    x &&
    !x.endsWith('.md') &&
    !x.endsWith('.css') &&
    !x.endsWith('.scss') &&
    !x.endsWith('.sass')
)

markdownFiles.map(file => {
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
    md = md.split('%%\n')[2]
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

  converter.process(md, (err, htmlFile) => {
    if (err) {
      console.error(`${chalk.red('  error:')} converting markdown -> html`)
      throw err
    }

    console.log(chalk.yellow('  converted markdown -> html'))

    let html = baseHtml

    if (parsedOpts.title) {
      html = html.replace('%%TITLE%%', parsedOpts.title)
    } else {
      html = html.replace('<title>%%TITLE%%</title>', '')
    }
    html = html.replace('%%CONTENT%%', String(htmlFile))

    if (parsedOpts.style) {
      const stylePath = path.resolve(dir, parsedOpts.style)
      let style = fs.readFileSync(stylePath, 'utf-8')

      if (stylePath.endsWith('.sass') || stylePath.endsWith('.scss')) {
        sass.render({ data: style }, (err, result) => {
          if (err) throw err
          style = result
        })
      }

      html = html.replace('%%STYLE%%', style)
      console.log(`${chalk.yellow('  imported styles:')} ${parsedOpts.style}`)
    } else {
      html = html.replace('<style>%%STYLE%%</style>', '')
    }

    fs.writeFileSync(filename.replace(baseDir, baseDir + '/out'), html)
    console.log(chalk.yellow('  wrote html file'))

    generatedFiles += 1
  })
})

assets.map(file => {
  console.log(`${chalk.cyan('processing:')} ${file}`)

  let dir = file.split('/')
  const filename = dir.pop()
  dir = dir.join('/')

  const outDir = dir.replace(baseDir, baseDir + '/out')

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir)
    console.log(`${chalk.yellow('  created directory:')} ${outDir}`)
  }

  fs.copyFileSync(file, path.resolve(outDir, filename))
  console.log(`${chalk.yellow('  copied asset:')} ${file}`)

  copiedAssets += 1
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
    open(`http://localhost:${args.port || 3000}`)
  })
}
