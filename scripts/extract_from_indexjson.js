var Tarball = require('indexed-tarball')
var fs = require('fs')
var path = require('path')
var pump = require('pump')
var mkdirp = require('mkdirp')

var base = process.argv[3]

var tarball = new Tarball(process.argv[2], require('os').tmpdir())

tarball.list(function (err, names) {
  var pending = names.length
  names.forEach(function (name) {
    var dirname = path.join(base, path.dirname(name))
    console.log('mkdir', dirname)
    mkdirp.sync(dirname)
    pump(tarball.read(name), fs.createWriteStream(path.join(base, name)), function (err) {
      if (err) throw err
      if (!--pending) console.log('done')
    })
  })
})

