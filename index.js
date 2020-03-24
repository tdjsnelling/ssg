const fs = require('fs')
const path = require('path')
const http = require('http')
const handler = require('serve-handler')
const chalk = require('chalk')

const remark = require('remark')
const recommended = require('remark-preset-lint-recommended')
const html = require('remark-html')

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

let generatedFiles = 0

const baseDir =
  process.env.NODE_ENV !== 'production'
    ? path.resolve(process.argv[2])
    : path.resolve(process.argv[1])

console.log(`${chalk.cyan('base directory:')} ${baseDir}`)

if (!fs.existsSync(path.resolve(baseDir, 'out'))) {
  fs.mkdirSync(path.resolve(baseDir, 'out'))
}

const getMarkdownFiles = directory => {
  const files = fs.readdirSync(directory)
  const resolved = files.map(file => {
    const res = path.resolve(directory, file)
    return fs.statSync(res).isDirectory() ? getMarkdownFiles(res) : res
  })
  const allFiles = resolved.reduce((a, f) => a.concat(f), [])
  return allFiles.filter(x => x.endsWith('.md'))
}

const markdownFiles = getMarkdownFiles(baseDir)

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
      const style = fs.readFileSync(stylePath, 'utf-8')
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

console.log(
  `${chalk.green('🚀 done!')} generated ${generatedFiles} static files`
)

const server = http.createServer((request, response) => {
  return handler(request, response, {
    public: path.resolve(baseDir, 'out'),
  })
})

server.listen(3000, () => {
  console.log(
    `${chalk.green('📄 done!')} server running at http://localhost:3000`
  )
})
